import { NextRequest, NextResponse } from "next/server"
import { creerReservationVehicule } from "@/lib/reservation-vehicule"

// Demande de location depuis l'APPLICATION. Même règle que le site : le
// chevauchement, le tarif dégressif et la commission sont calculés côté
// serveur, dans la bibliothèque partagée. L'application n'envoie que ce que
// le client a saisi.
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 })
  }

  const r = await creerReservationVehicule({
    vehicule_id: id,
    nom: String(body.nom ?? ""),
    telephone: String(body.telephone ?? ""),
    email: body.email ? String(body.email) : undefined,
    debut: String(body.debut ?? ""),
    fin: String(body.fin ?? ""),
    avec_chauffeur: !!body.avec_chauffeur,
    message: body.message ? String(body.message) : undefined,
  })

  // Une demande refusée n'est pas une panne : le message explique quoi
  // corriger (dates prises, véhicule retiré). 200 avec `ok:false` évite que
  // l'application affiche « erreur réseau » à la place.
  return NextResponse.json(r)
}
