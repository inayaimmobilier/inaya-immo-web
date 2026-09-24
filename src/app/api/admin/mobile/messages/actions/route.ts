import { NextRequest, NextResponse } from "next/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"
import { relancerMessages, supprimerMessages, modifierMessage } from "@/lib/messages-admin"

// ============================================================================
// ACTIONS GROUPÉES SUR LES MESSAGES — depuis l'application.
//
// Même logique que le back-office (`lib/messages-admin.ts`) : relancer,
// supprimer, ou corriger le texte avant de relancer. La suppression est
// réservée aux administrateurs — elle efface le texte d'origine, donc la
// possibilité de retrouver l'annonce dans WhatsApp.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  let corps: { action?: string; ids?: string[]; id?: string; contenu?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  if (corps.action === "relancer") {
    const r = await relancerMessages(corps.ids ?? [])
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  if (corps.action === "supprimer") {
    if (!peut(staff.role, "supprimer")) return refus("acces_refuse")
    const r = await supprimerMessages(corps.ids ?? [])
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  if (corps.action === "modifier") {
    if (!corps.id) return NextResponse.json({ error: "id_requis" }, { status: 400 })
    const r = await modifierMessage(corps.id, corps.contenu ?? "")
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  return NextResponse.json({ error: "action_inconnue" }, { status: 400 })
}
