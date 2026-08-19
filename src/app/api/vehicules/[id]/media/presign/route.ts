import { NextRequest, NextResponse } from "next/server"
import { presignPutUrl, publicUrlForKey, r2Configured } from "@/lib/r2"
import { accesVehicule } from "@/lib/vehicules-acces"

// Envoi DIRECT navigateur → R2. Les photos de véhicules partent souvent depuis
// un téléphone, en série et en pleine résolution : passer par la fonction
// serverless heurterait la limite de corps de Vercel (~4,5 Mo) sur la première
// photo un peu lourde.
export const runtime = "nodejs"

const EXT_VIDEO = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const EXT_DOC = new Set(["pdf"])
const MAX_OCTETS = 100 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const acces = await accesVehicule(id)
  if (!acces.userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  if (!acces.autorise) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  if (!r2Configured()) return NextResponse.json({ error: "Stockage R2 non configuré" }, { status: 503 })

  let body: { files?: { name?: string; contentType?: string; size?: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const fichiers = body.files ?? []
  if (fichiers.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  if (fichiers.length > 20) return NextResponse.json({ error: "20 fichiers maximum à la fois" }, { status: 400 })

  const items: { key: string; uploadUrl: string; publicUrl: string; type: string; contentType: string }[] = []
  const errors: string[] = []
  let i = 0
  for (const f of fichiers) {
    const nom = (f.name ?? "fichier").replace(/[^\w.-]/g, "_")
    if ((f.size ?? 0) > MAX_OCTETS) { errors.push(`${nom} dépasse 100 Mo`); continue }
    const ext = (nom.split(".").pop() ?? "jpg").toLowerCase()
    const type = EXT_VIDEO.has(ext) ? "video" : EXT_DOC.has(ext) ? "document" : "image"
    const contentType = f.contentType
      || (type === "video" ? "video/mp4" : type === "document" ? "application/pdf" : "image/jpeg")
    const key = `vehicules/${id}/${Date.now()}_${i++}.${ext}`
    try {
      items.push({
        key, uploadUrl: await presignPutUrl(key, contentType),
        publicUrl: publicUrlForKey(key), type, contentType,
      })
    } catch (e) {
      errors.push(`${nom} : ${(e as Error).message}`)
    }
  }
  return NextResponse.json({ items, errors })
}
