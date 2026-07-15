"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { notifyAgentAssignment } from "@/lib/notifications"

type Res = { ok: true; agentNom: string } | { ok: false; error: string }

/**
 * L'agent TRANSFÈRE la tâche à un autre agent depuis le bouton WhatsApp.
 * Réassigne le lead, clôt le followup en attente, et notifie le nouvel agent
 * (même message d'assignation, avec ses propres boutons Confirmer / Transférer).
 *
 * Sécurité : la référence courte joue le rôle de jeton (comme /t/{ref}) — seul
 * l'agent destinataire du message la connaît.
 */
export async function transferTask(refRaw: string, toAgentId: string): Promise<Res> {
  const refCode = String(refRaw).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)
  if (refCode.length !== 4) return { ok: false, error: "Référence invalide." }
  if (!toAgentId) return { ok: false, error: "Choisissez un agent." }

  const admin = createAdminClient()

  const { data: fu } = await admin.from("lead_followups")
    .select("lead_id").eq("ref", refCode)
    .order("envoye_le", { ascending: false }).limit(1).maybeSingle()
  const leadId = (fu as { lead_id: string } | null)?.lead_id ?? null
  if (!leadId) return { ok: false, error: "Tâche introuvable ou expirée." }

  const { data: leadData } = await admin.from("leads")
    .select("agent_id, contact_nom, property_id, statut, properties(titre)").eq("id", leadId).single()
  const lead = leadData as {
    agent_id: string | null; contact_nom: string | null; property_id: string; statut: string
    properties: { titre: string } | { titre: string }[] | null
  } | null
  if (!lead) return { ok: false, error: "Tâche introuvable." }
  if (["conclu", "abandonne"].includes(lead.statut)) return { ok: false, error: "Cette tâche est déjà clôturée." }
  if (lead.agent_id === toAgentId) return { ok: false, error: "Cette tâche est déjà assignée à cet agent." }

  // Le nouvel agent doit être un agent actif.
  const { data: agentData } = await admin.from("profiles")
    .select("nom, prenom, role, status").eq("id", toAgentId).single()
  const agent = agentData as { nom: string | null; prenom: string | null; role: string; status: string } | null
  if (!agent || agent.role !== "agent" || agent.status !== "actif") {
    return { ok: false, error: "Agent indisponible." }
  }
  const agentNom = [agent.prenom, agent.nom].filter(Boolean).join(" ") || "l'agent"

  const { error: updErr } = await admin.from("leads")
    .update({ agent_id: toAgentId, agent_confirmation_le: null } as never).eq("id", leadId)
  if (updErr) {
    console.error("INAYA-TASK-TRANSFER-001", updErr.code, updErr.message)
    return { ok: false, error: "Transfert impossible pour le moment." }
  }

  // Clôt le followup de l'agent précédent (best-effort) pour qu'il ne soit plus relancé.
  await admin.from("lead_followups")
    .update({ reponse_brute: "transfere", statut_apres: lead.statut, repondu_le: new Date().toISOString() } as never)
    .eq("lead_id", leadId).is("repondu_le", null)

  // Notifie le nouvel agent (crée aussi son propre followup + code de confirmation).
  const titre = (Array.isArray(lead.properties) ? lead.properties[0] : lead.properties)?.titre ?? "un bien"
  try {
    await notifyAgentAssignment({
      agentId: toAgentId, leadId, propertyId: lead.property_id,
      propertyTitre: titre, contactNom: lead.contact_nom || "un client",
    })
  } catch (e) {
    console.error("INAYA-TASK-TRANSFER-002", e)
    // Le transfert est fait ; seule la notification a échoué.
  }

  return { ok: true, agentNom }
}
