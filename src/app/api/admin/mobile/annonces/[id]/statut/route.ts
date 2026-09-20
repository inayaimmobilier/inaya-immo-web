import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// CHANGEMENT DE STATUT DEPUIS LE TÉLÉPHONE.
//
// Le même enchaînement que le back-office : publier pose la durée de vie de
// l'annonce PUIS prévient les chercheurs dont la recherche correspond. Sans
// cela, une annonce validée au téléphone n'alerterait personne et n'expirerait
// jamais — deux différences invisibles, et coûteuses.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUTS = ["publie", "en_attente_validation", "rejete", "suspendu"]

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  let body: { statut?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  const statut = body.statut ?? ""
  if (!STATUTS.includes(statut)) return NextResponse.json({ error: "statut_inconnu" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("properties").update({ statut } as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let alertes = 0
  if (statut === "publie") {
    try {
      const { expireAtForProperty } = await import("@/lib/property-expiry")
      const eat = await expireAtForProperty(id)
      if (eat) await admin.from("properties").update({ expire_at: eat } as never).eq("id", id)
    } catch (e) { console.error("INAYA-EXPIRE-SET-MOBILE", e) }
    try {
      const { runMatchingForProperty } = await import("@/lib/matching")
      alertes = await runMatchingForProperty(id)
    } catch (e) { console.error("INAYA-MATCH-MOBILE", e) }
  }

  return NextResponse.json({ ok: true, statut, alertes })
}
