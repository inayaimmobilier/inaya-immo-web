import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { uploadToR2, publicUrlForKey, r2Configured } from "@/lib/r2"

// ============================================================================
// Repli d'upload PROXY (navigateur → NOTRE serveur → R2). Utilisé quand l'upload
// DIRECT navigateur → R2 échoue (« Failed to fetch » = CORS du bucket non
// configuré). Ici l'envoi vers R2 se fait côté serveur → AUCUN CORS requis.
//
// ⚠️ Limité par le plafond de corps Vercel (~4,5 Mo) : convient aux PHOTOS, pas
// aux vidéos lourdes (qui exigent le CORS R2 + l'upload direct). Mêmes garde-fous
// que la présignature : annonce de source 'proprietaire', créée il y a < 2 h.
// ============================================================================

export const runtime = "nodejs"

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv", "m4v", "3gp"])
// SÉCURITÉ : extensions LIMITÉES aux images/vidéos (pas de .html/.svg servis
// depuis le domaine des médias → phishing/XSS).
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp"])
const MAX_PROXY_BYTES = 4 * 1024 * 1024 // marge sous la limite Vercel (~4,5 Mo)
const WINDOW_MS = 2 * 60 * 60 * 1000

async function assertUploadable(propertyId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: prop } = await admin.from("properties")
    .select("id, source, created_at").eq("id", propertyId).single()
  const p = prop as { source: string; created_at: string } | null
  if (!p) return "Annonce introuvable"
  if (p.source !== "proprietaire") return "Upload non autorisé"
  if (Date.now() - new Date(p.created_at).getTime() > WINDOW_MS) return "Délai d'upload expiré (2h). Contactez-nous."
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!r2Configured()) return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 })
  const { id: propertyId } = await params
  const guard = await assertUploadable(propertyId)
  if (guard) return NextResponse.json({ error: guard }, { status: guard.includes("introuvable") ? 404 : 403 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
  if (file.size > MAX_PROXY_BYTES) {
    return NextResponse.json({ error: "Fichier trop lourd pour cette voie (max ~4 Mo). Les vidéos nécessitent la config CORS R2." }, { status: 413 })
  }

  const name = (file.name || "fichier").replace(/[^\w.-]/g, "_")
  const ext = (name.split(".").pop() ?? "jpg").toLowerCase()
  const isVideo = VIDEO_EXTS.has(ext)
  if (!isVideo && !IMAGE_EXTS.has(ext)) {
    return NextResponse.json({ error: "Format non accepté (photos ou vidéos uniquement)." }, { status: 415 })
  }
  // Content-Type contraint à image/* ou video/* (cohérent avec l'extension).
  const contentType = (isVideo ? file.type.startsWith("video/") : file.type.startsWith("image/"))
    ? file.type : (isVideo ? "video/mp4" : "image/jpeg")
  const key = `properties/${propertyId}/${Date.now()}.${ext}`
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    await uploadToR2(key, buf, contentType)
    return NextResponse.json({ key, publicUrl: publicUrlForKey(key), type: isVideo ? "video" : "image" })
  } catch (e) {
    return NextResponse.json({ error: `Envoi échoué : ${(e as Error).message}` }, { status: 500 })
  }
}
