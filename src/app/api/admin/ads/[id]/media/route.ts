import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { uploadToR2, publicUrlForKey, r2Configured } from "@/lib/r2"

// ─────────────────────────────────────────────────────────────────────────────
// Repli serveur pour l'upload des médias publicitaires.
//
// Pourquoi cette route existe :
// L'upload idéal est "PUT direct navigateur → R2" via /presign (rapide, pas de
// limite serverless). MAIS le CORS du bucket R2 doit autoriser l'origine du
// site. Si ce n'est pas le cas (ex: nouveau domaine, config CORS absente), le
// navigateur bloque le PUT avec l'erreur générique "Failed to fetch".
//
// Cette route est le repli : le navigateur envoie le fichier en FormData, le
// serveur le pousse vers R2 avec ses credentials. Plus lent (limite corps
// serverless ~4,5 Mo sur Vercel) mais marche toujours.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs"
export const maxDuration = 60

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"])
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 Mo (cohérent avec /presign)

async function checkAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (prof as { role?: string } | null)?.role
  return role === "super_admin" || role === "admin"
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  if (!r2Configured()) return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 })

  const { id: adItemId } = await params

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: "Corps invalide (FormData attendu)" }, { status: 400 })
  }
  const entries = formData.getAll("files").filter(f => f instanceof File) as File[]
  if (entries.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  if (entries.length > 4) return NextResponse.json({ error: "4 fichiers maximum par appel" }, { status: 400 })

  const items: { key: string; publicUrl: string; type: "image" | "video"; contentType: string }[] = []
  const errors: string[] = []
  let i = 0
  for (const file of entries) {
    const name = (file.name || "fichier").replace(/[^\w.-]/g, "_")
    if (file.size > MAX_FILE_BYTES) { errors.push(`${name} dépasse 50 Mo`); continue }
    const ext = (name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    const isImage = IMAGE_EXTS.has(ext)
    if (!isVideo && !isImage) { errors.push(`${name} : format non supporté`); continue }
    const contentType = file.type || (isVideo ? "video/mp4" : "image/jpeg")
    const key = `ads/${adItemId}/${Date.now()}_${i++}.${ext}`
    try {
      await uploadToR2(key, Buffer.from(await file.arrayBuffer()), contentType)
      items.push({ key, publicUrl: publicUrlForKey(key), type: isVideo ? "video" : "image", contentType })
    } catch (e) {
      errors.push(`${name} : ${(e as Error).message}`)
    }
  }
  return NextResponse.json({ items, errors })
}
