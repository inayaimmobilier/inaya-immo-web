import { NextRequest, NextResponse } from "next/server"
import { roleStaffDeRequete } from "@/lib/staff-requete"
import { presignPutUrl, publicUrlForKey, r2Configured } from "@/lib/r2"

// Génère des URLs présignées pour un upload DIRECT navigateur → R2, afin
// d'envoyer des vidéos lourdes sans heurter la limite de corps serverless de
// Vercel (~4,5 Mo). Réservé au staff — back-office web (cookie) ou app admin (jeton).
export const runtime = "nodejs"

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 Mo

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await roleStaffDeRequete(req)
  if (!role) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  if (!r2Configured()) return NextResponse.json({ error: "Stockage R2 non configuré" }, { status: 503 })

  const { id: propertyId } = await params
  let body: { files?: { name?: string; contentType?: string; size?: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const files = body.files ?? []
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  if (files.length > 20) return NextResponse.json({ error: "20 fichiers maximum à la fois" }, { status: 400 })

  const items: { key: string; uploadUrl: string; publicUrl: string; type: "image" | "video"; contentType: string }[] = []
  const errors: string[] = []
  let i = 0
  for (const f of files) {
    const name = (f.name ?? "fichier").replace(/[^\w.-]/g, "_")
    if ((f.size ?? 0) > MAX_FILE_BYTES) { errors.push(`${name} dépasse 200 Mo`); continue }
    const ext = (name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    const contentType = f.contentType || (isVideo ? "video/mp4" : "image/jpeg")
    const key = `properties/${propertyId}/${Date.now()}_${i++}.${ext}`
    try {
      const uploadUrl = await presignPutUrl(key, contentType)
      items.push({ key, uploadUrl, publicUrl: publicUrlForKey(key), type: isVideo ? "video" : "image", contentType })
    } catch (e) {
      errors.push(`${name} : ${(e as Error).message}`)
    }
  }
  return NextResponse.json({ items, errors })
}
