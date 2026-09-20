import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// REMETTRE UN MESSAGE DANS LA FILE.
//
// Un message qui a épuisé ses tentatives n'est plus jamais repris : il reste
// là, invisible, et l'annonce qu'il portait n'existera jamais. Remettre le
// compteur à zéro et lever le verrou suffit — le service le reprend au cycle
// suivant, avec le correctif qui a entre-temps été déployé.
//
// On ne re-traite PAS ici même : le service d'ingestion a le contexte (moteurs
// WhatsApp, géographie chargée, file d'attente), le site non.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data: avant } = await admin.from("whatsapp_messages")
    .select("traite").eq("id", id).maybeSingle()
  if (!avant) return NextResponse.json({ error: "introuvable" }, { status: 404 })
  if ((avant as { traite: boolean }).traite) {
    return NextResponse.json({ error: "Ce message a déjà été traité." }, { status: 400 })
  }

  const { error } = await admin.from("whatsapp_messages")
    .update({ en_traitement: false, tentatives: 0, erreur_traitement: null } as never)
    .eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
