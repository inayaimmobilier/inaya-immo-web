import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { presignPutUrl, publicUrlForKey, r2Configured } from "@/lib/r2"

// URLs présignées pour l'upload direct navigateur → R2 des médias publicitaires.
// Réservé aux admins. Le media est stocké sous ads/<adItemId>/...
export const runtime = "nodejs"

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"])
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 Mo par média pub (les pubs n'ont pas
                                         // besoin de vidéos lourdes comme les annonces)

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

  let body: { files?: { name?: string; contentType?: string; size?: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const files = body.files ?? []
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  if (files.length > 4) return NextResponse.json({ error: "4 fichiers maximum par pub" }, { status: 400 })

  const items: { key: string; uploadUrl: string; publicUrl: string; type: "image" | "video"; contentType: string }[] = []
  const errors: string[] = []
  let i = 0
  for (const f of files) {
    const name = (f.name ?? "fichier").replace(/[^\w.-]/g, "_")
    if ((f.size ?? 0) > MAX_FILE_BYTES) { errors.push(`${name} dépasse 50 Mo`); continue }
    const ext = (name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    const isImage = IMAGE_EXTS.has(ext)
    if (!isVideo && !isImage) { errors.push(`${name} : format non supporté (jpg, png, webp, gif, mp4…)`); continue }
    const contentType = f.contentType || (isVideo ? "video/mp4" : "image/jpeg")
    const key = `ads/${adItemId}/${Date.now()}_${i++}.${ext}`
    try {
      const uploadUrl = await presignPutUrl(key, contentType)
      items.push({ key, uploadUrl, publicUrl: publicUrlForKey(key), type: isVideo ? "video" : "image", contentType })
    } catch (e) { errors.push(`${name} : ${(e as Error).message}`) }
  }
  return NextResponse.json({ items, errors })
}
