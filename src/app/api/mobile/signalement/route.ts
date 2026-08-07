import { NextRequest, NextResponse } from "next/server"
import { enregistrerSignalement, CATEGORIES_SIGNALEMENT } from "@/lib/signalement"
import { userIdFromAuthHeader } from "@/lib/mobile-session"
import { ipDe, limiteAtteinte, TROP_DE_TENTATIVES } from "@/lib/rate-limit"

// ============================================================================
// SIGNALER UNE ANNONCE DEPUIS L'APPLICATION.
//
// L'application ouvrait WhatsApp avec un message pré-écrit. Le signalement
// n'existait donc nulle part en base, n'apparaissait dans aucun tableau de
// bord, et se perdait dans une conversation parmi d'autres. L'utilisateur
// croyait avoir agi ; personne ne recevait rien d'exploitable.
//
// Cette route fait exactement ce que fait le site : elle enregistre dans
// `signalements` et alerte le staff, par le même module.
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  // Signaler est GRATUIT et anonyme par nature : c'est justement ce qui le
  // rend dénonçable en masse. Une limite par adresse évite qu'un concurrent
  // ne fasse pleuvoir des signalements sur les annonces d'un rival.
  if (limiteAtteinte(`signalement:${ipDe(req)}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: TROP_DE_TENTATIVES }, { status: 429 })
  }

  let body: { property_id?: string; categorie?: string; motif?: string; contact?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  // La catégorie vient d'une liste fermée : accepter n'importe quel texte
  // laisserait remplir la colonne de contenu arbitraire, et rendrait le tri
  // des signalements dans l'administration impossible.
  const categorie = CATEGORIES_SIGNALEMENT.includes(body.categorie as never) ? body.categorie : null

  const res = await enregistrerSignalement({
    propertyId: String(body.property_id ?? ""),
    categorie,
    motif: body.motif,
    contact: body.contact,
    // Rattache le compte quand la personne est connectée — sans l'exiger : un
    // visiteur non identifié doit pouvoir signaler une annonce frauduleuse.
    userId: userIdFromAuthHeader(req.headers.get("authorization")),
  })

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}

/** Liste des motifs, pour que l'application n'en tienne pas sa propre copie. */
export async function GET() {
  return NextResponse.json({ categories: CATEGORIES_SIGNALEMENT })
}
