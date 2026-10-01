import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// ATTRIBUER UN LEAD À UN AGENT depuis le téléphone — même effet que le
// back-office (assignLead) : l'agent reçoit la tâche (WhatsApp / Telegram /
// application), le dossier passe « en cours » s'il était « nouveau ».
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  let corps: { agent_id?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  const agentId = corps.agent_id ?? ""
  const admin = createAdminClient()

  const [{ data: l }, { data: ag }] = await Promise.all([
    admin.from("leads").select("statut,contact_nom,property_id,properties(titre)").eq("id", id).maybeSingle(),
    admin.from("profiles").select("id,nom,telephone,role").eq("id", agentId).maybeSingle(),
  ])
  const lead = l as { statut: string; contact_nom: string | null; property_id: string; properties: { titre: string } | { titre: string }[] | null } | null
  const agent = ag as { id: string; nom: string | null; telephone: string | null; role: string } | null
  if (!lead) return NextResponse.json({ error: "Ce lead n'existe plus." }, { status: 404 })
  if (!agent || agent.role !== "agent") return NextResponse.json({ error: "Agent introuvable." }, { status: 400 })

  const patch: Record<string, unknown> = { agent_id: agentId }
  if (lead.statut === "nouveau") { patch.statut = "en_traitement"; patch.pris_en_charge_le = new Date().toISOString() }
  const { error } = await admin.from("leads").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const titre = (Array.isArray(lead.properties) ? lead.properties[0] : lead.properties)?.titre ?? "un bien"
  let avertissement: string | null = agent.telephone ? null
    : "Lead attribué, mais l'agent n'a pas de numéro dans son profil : il ne recevra pas le message WhatsApp."
  try {
    const { notifyAgentAssignment } = await import("@/lib/notifications")
    await notifyAgentAssignment({ agentId, propertyTitre: titre, contactNom: lead.contact_nom || "un client", leadId: id, propertyId: lead.property_id })
  } catch (e) { avertissement = `Lead attribué, mais la notification a échoué : ${(e as Error).message}` }

  const { journaliser } = await import("@/lib/lead-suivi")
  await journaliser(admin, id, { type: "attribution", auteurId: staff.userId, detail: `Attribué à ${agent.nom ?? "un agent"}` })
  return NextResponse.json({ ok: true, avertissement })
}
