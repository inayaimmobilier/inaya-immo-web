import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"
import { etatCompte, apercuDeverrouillage, deverrouillerContact } from "@/lib/credits"
import { ipDe, limiteAtteinte, TROP_DE_TENTATIVES } from "@/lib/rate-limit"

// ============================================================================
// CRÉDITS PROFESSIONNELS — API de l'application.
//
//   GET  ?property_id=…  → solde, historique, et le prix du contact demandé
//   POST { property_id } → débite et rend le contact
//
// L'identité vient TOUJOURS du jeton de session, jamais du corps de la requête :
// accepter un identifiant d'utilisateur transmis par l'appelant reviendrait à
// laisser n'importe qui dépenser le solde d'un autre.
//
// Le TARIF n'est jamais reçu du client non plus : il est recalculé côté serveur
// à chaque appel. Un prix transmis par l'application se négocierait depuis un
// terminal.
// ============================================================================
export const runtime = "nodejs"

/** Refuse la requête si elle n'est pas authentifiée. */
function qui(req: NextRequest): string | null {
  return userIdFromAuthHeader(req.headers.get("authorization"))
}

export async function GET(req: NextRequest) {
  const userId = qui(req)
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 })

  const compte = await etatCompte(userId)
  const admin = createAdminClient()

  // Historique : les vingt derniers mouvements suffisent à un écran de compte,
  // et évitent de rapatrier des mois d'écritures à chaque ouverture.
  const { data: mouvements } = await admin.from("credit_entries")
    .select("id, montant, solde_apres, type, motif, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(20)

  const propertyId = req.nextUrl.searchParams.get("property_id")
  const apercu = propertyId ? await apercuDeverrouillage(userId, propertyId) : null

  return NextResponse.json({
    solde: compte.solde,
    actif: compte.actif,
    suspendu: compte.suspendu,
    mouvements: mouvements ?? [],
    apercu,
  })
}

export async function POST(req: NextRequest) {
  const userId = qui(req)
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 })

  // Anti-emballement : un achat de contact engage de l'argent. Une boucle,
  // volontaire ou due à un bogue d'interface, viderait un solde en secondes.
  // La limite est par COMPTE et non par adresse : c'est le solde qu'on protège.
  if (limiteAtteinte(`credit:${userId}`, 20, 60 * 60_000) ||
      limiteAtteinte(`credit:ip:${ipDe(req)}`, 60, 60 * 60_000)) {
    return NextResponse.json({ error: TROP_DE_TENTATIVES }, { status: 429 })
  }

  let body: { property_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const propertyId = String(body.property_id ?? "").trim()
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(propertyId)) {
    return NextResponse.json({ error: "Annonce invalide." }, { status: 400 })
  }

  const r = await deverrouillerContact(userId, propertyId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })

  return NextResponse.json({
    ok: true,
    telephone: r.telephone,
    nom: r.nom,
    source: r.source,
    cout: r.cout,
    solde: r.solde,
    deja: r.deja,
  })
}
