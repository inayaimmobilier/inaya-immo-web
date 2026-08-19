import { NextRequest, NextResponse } from "next/server"
import { uploadToR2, r2Configured, publicUrlForKey } from "@/lib/r2"
import { accesVehicule } from "@/lib/vehicules-acces"

// Repli quand le PUT direct échoue — typiquement parce que le CORS du bucket
// n'autorise pas l'origine du site. Le fichier transite alors par le serveur,
// plus lent mais toujours mieux qu'un téléversement impossible.
export const runtime = "nodejs"
export const maxDuration = 60

const MAX_OCTETS = 4 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const acces = await accesVehicule(id)
  if (!acces.userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  if (!acces.autorise) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  if (!r2Configured()) return NextResponse.json({ error: "Stockage R2 non configuré" }, { status: 503 })

  let formData: FormData
  try { formData = await req.formData() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const fichiers = formData.getAll("files") as File[]
  if (fichiers.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })

  const urls: string[] = []
  const errors: string[] = []
  let i = 0
  for (const f of fichiers) {
    if (f.size > MAX_OCTETS) {
      // Le repli passe par la fonction serverless : au-delà de sa limite de
      // corps, l'envoi échouerait sans message utile. On le dit franchement.
      errors.push(`${f.name} : trop volumineux pour l'envoi de secours (4 Mo max).`)
      continue
    }
    const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase()
    const key = `vehicules/${id}/${Date.now()}_${i++}.${ext}`
    try {
      await uploadToR2(key, Buffer.from(await f.arrayBuffer()), f.type || "image/jpeg")
      urls.push(publicUrlForKey(key))
    } catch (e) {
      errors.push(`${f.name} : ${(e as Error).message}`)
    }
  }
  return NextResponse.json({ urls, errors })
}
