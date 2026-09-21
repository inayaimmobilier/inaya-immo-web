import { NextRequest, NextResponse } from "next/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"
import { lire } from "@/lib/vision-agent"
import type { ImagePourLlm } from "@/lib/llm"

// ============================================================================
// LIRE UNE PHOTO DE DOCUMENT.
//
// Cette route NE CRÉE RIEN. Elle lit et rend ce qu'elle a compris, avec ses
// doutes. C'est l'agent qui décide ensuite, et l'enregistrement passe par
// l'import — le même chemin que pour un fichier, avec le même dédoublonnage.
//
// Deux raisons de ne pas enregistrer ici : une lecture automatique se trompe,
// et l'agent est le seul à pouvoir comparer avec le papier qu'il a en main.
//
// Les images arrivent DÉJÀ RÉDUITES par le téléphone (1600 px de large). Une
// photo brute de 4 Mo coûterait cher à l'envoi sur une connexion de terrain,
// et le modèle n'en lirait pas mieux.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_IMAGES = 5
const MAX_OCTETS = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  let c: { images?: { media_type?: string; base64?: string }[] }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const brutes = (c.images ?? []).filter(i => i?.base64)
  if (!brutes.length) return NextResponse.json({ error: "aucune_image" }, { status: 400 })
  if (brutes.length > MAX_IMAGES) {
    return NextResponse.json({
      error: "trop_d_images",
      message: `${MAX_IMAGES} photos au maximum à la fois.`,
    }, { status: 413 })
  }

  const images: ImagePourLlm[] = []
  let total = 0
  for (const i of brutes) {
    const taille = Math.floor((i.base64!.length * 3) / 4)
    total += taille
    if (total > MAX_OCTETS) {
      return NextResponse.json({
        error: "images_trop_lourdes",
        message: "Les photos dépassent 5 Mo au total. Reprenez-les de plus loin, ou une à une.",
      }, { status: 413 })
    }
    images.push({
      mediaType: i.media_type === "image/png" ? "image/png" : "image/jpeg",
      base64: i.base64!,
    })
  }

  const resultat = await lire(images)
  if ("erreur" in resultat) {
    // L'erreur du fournisseur est rendue telle quelle : « clé absente »,
    // « modèle retiré » et « photo illisible » demandent trois gestes
    // différents, et seul l'agent peut les faire.
    return NextResponse.json({ error: "lecture_impossible", message: resultat.erreur }, { status: 502 })
  }

  return NextResponse.json({
    clients: resultat.clients,
    modele: resultat.modele,
    avertissements: resultat.avertissements,
    // Prêts à être enregistrés : ceux qui ont un nom ET un numéro.
    enregistrables: resultat.clients.filter(c2 => c2.telephone).length,
  })
}
