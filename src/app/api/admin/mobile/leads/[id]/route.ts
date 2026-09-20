import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// FAIRE AVANCER UNE TÂCHE.
//
// Changer le statut d'un lead, et consigner un compte rendu. Le compte rendu
// n'est pas décoratif : c'est ce qui permet à un collègue de reprendre le
// dossier sans rappeler le client pour lui refaire raconter son histoire.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUTS = [
  "nouveau", "en_traitement", "contacte", "visite_planifiee",
  "visite_effectuee", "paiement_planifie", "conclu", "abandonne",
]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  let corps: { statut?: string; compte_rendu?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (corps.statut) {
    if (!STATUTS.includes(corps.statut)) return NextResponse.json({ error: "statut_inconnu" }, { status: 400 })
    patch.statut = corps.statut
    // Un lead qu'on fait avancer est un lead qu'on prend en charge : sans
    // cela, il resterait éternellement « non attribué » dans les listes.
    patch.agent_id = staff.userId
    patch.pris_en_charge_le = new Date().toISOString()
  }
  if (typeof corps.compte_rendu === "string") {
    patch.compte_rendu = corps.compte_rendu.trim().slice(0, 2000) || null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "rien_a_modifier" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("leads").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, statut: patch.statut ?? null })
}
