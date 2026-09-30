import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// SIGNALEMENTS TRAITÉS DEPUIS LE TÉLÉPHONE — même effet que le bouton du
// back-office (marquerSignalementsTraites) : les signalements ouverts de
// l'annonce passent « traité », avec l'auteur et la date. L'annonce sort alors
// de l'onglet « Signalées ».
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  const { data, error } = await createAdminClient().from("signalements")
    .update({ statut: "traite", traite_par: staff.userId, traite_le: new Date().toISOString() } as never)
    .eq("property_id", id).eq("statut", "nouveau")
    .select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, traites: (data ?? []).length })
}
