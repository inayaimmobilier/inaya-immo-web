import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { presignPutUrl, publicUrlForKey, r2Configured } from "@/lib/r2"

// URLs présignées pour l'upload direct navigateur → R2 côté PUBLIC (propriétaire
// juste après dépôt, sans compte). Mêmes garde-fous que l'upload public : annonce
// de source 'proprietaire', en attente de validation, créée il y a moins de 2 h.
export const runtime = "nodejs"

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv", "m4v", "3gp"])
// SÉCURITÉ : extensions LIMITÉES aux images/vidéos. Sans allowlist, un fichier
// .html/.svg uploadé serait servi depuis le domaine des médias (phishing/XSS).
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp"])
const MAX_FILE_BYTES = 200 * 1024 * 1024
const WINDOW_MS = 2 * 60 * 60 * 1000

async function assertUploadable(propertyId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: prop } = await admin.from("properties")
    .select("id, statut, source, created_at").eq("id", propertyId).single()
  const p = prop as { statut: string; source: string; created_at: string } | null
  if (!p) return "Annonce introuvable"
  // On n'exige PLUS statut=en_attente_validation : la modération IA auto-approuve
  // souvent l'annonce quasi immédiatement après création (notamment sans clé API
  // IA), ce qui faisait passer le statut à 'publie' AVANT que le propriétaire
  // n'ait eu le temps d'uploader ses photos → upload bloqué à tort.
  // La source 'proprietaire' + la fenêtre de 2h suffisent à sécuriser l'accès.
  if (p.source !== "proprietaire") return "Upload non autorisé"
  if (Date.now() - new Date(p.created_at).getTime() > WINDOW_MS) return "Délai d'upload expiré (2h). Contactez-nous."
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!r2Configured()) return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 })
  const { id: propertyId } = await params
  const guard = await assertUploadable(propertyId)
  if (guard) return NextResponse.json({ error: guard }, { status: guard.includes("introuvable") ? 404 : 403 })

  let body: { files?: { name?: string; contentType?: string; size?: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const files = body.files ?? []
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  if (files.length > 20) return NextResponse.json({ error: "20 fichiers maximum" }, { status: 400 })

  const items: { key: string; uploadUrl: string; publicUrl: string; type: "image" | "video"; contentType: string }[] = []
  const errors: string[] = []
  let i = 0
  for (const f of files) {
    const name = (f.name ?? "fichier").replace(/[^\w.-]/g, "_")
    if ((f.size ?? 0) > MAX_FILE_BYTES) { errors.push(`${name} dépasse 200 Mo`); continue }
    const ext = (name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    if (!isVideo && !IMAGE_EXTS.has(ext)) { errors.push(`${name} : format non accepté (photos ou vidéos uniquement).`); continue }
    // Content-Type contraint à image/* ou video/* (cohérent avec l'extension).
    const claimed = f.contentType ?? ""
    const contentType = (isVideo ? claimed.startsWith("video/") : claimed.startsWith("image/"))
      ? claimed : (isVideo ? "video/mp4" : "image/jpeg")
    const key = `properties/${propertyId}/${Date.now()}_${i++}.${ext}`
    try {
      const uploadUrl = await presignPutUrl(key, contentType)
      items.push({ key, uploadUrl, publicUrl: publicUrlForKey(key), type: isVideo ? "video" : "image", contentType })
    } catch (e) { errors.push(`${name} : ${(e as Error).message}`) }
  }
  return NextResponse.json({ items, errors })
}
