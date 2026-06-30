"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { notifyAgentAssignment } from "@/lib/notifications"
import type { UserRole } from "@/types/database"

const ALLOWED_STATUTS = [
  "nouveau", "en_traitement", "contacte", "visite_planifiee", "visite_effectuee", "paiement_planifie", "conclu", "abandonne",
]

type Result = { ok: true; warning?: string } | { ok: false; error: string }

// Statuts qui méritent une notification proactive à l'agent assigné
const NOTIFY_STATUTS = new Set(["en_traitement", "contacte", "visite_planifiee", "visite_effectuee"])

/** Change le statut d'un lead (réservé au staff). */
export async function setLeadStatut(leadId: string, statut: string): Promise<Result> {
  if (!ALLOWED_STATUTS.includes(statut)) return { ok: false, error: "Statut invalide." }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur", "agent"].includes(role)) {
    return { ok: false, error: "Action réservée au staff." }
  }

  const admin = createAdminClient()

  // Récupère le lead avant update pour décider si on notifie l'agent.
  const { data: leadBefore } = await admin
    .from("leads")
    .select("agent_id, contact_nom, property_id, properties(titre)")
    .eq("id", leadId)
    .single()
  const lb = leadBefore as { agent_id: string | null; contact_nom: string | null; property_id: string; properties: { titre: string } | { titre: string }[] | null } | null

  const patch: Record<string, unknown> = { statut }
  // Première prise en charge → on enregistre l'agent et l'horodatage.
  if (statut === "en_traitement") {
    patch.agent_id = user.id
    patch.pris_en_charge_le = new Date().toISOString()
  }

  const { error } = await admin.from("leads").update(patch as never).eq("id", leadId)
  if (error) {
    console.error("INAYA-LEAD-010", error)
    return { ok: false, error: "Échec de la mise à jour du statut." }
  }

  // Notifie l'agent assigné si le statut est significatif et l'agent est différent de l'acteur.
  if (lb && NOTIFY_STATUTS.has(statut)) {
    // Pour "en_traitement" l'agent sera l'utilisateur actuel — pas besoin de le notifier.
    const agentId = statut === "en_traitement" ? null : (lb.agent_id ?? null)
    if (agentId && agentId !== user.id) {
      const titre = (Array.isArray(lb.properties) ? lb.properties[0] : lb.properties)?.titre ?? "un bien"
      notifyAgentAssignment({
        agentId,
        propertyTitre: titre,
        contactNom: lb.contact_nom || "un client",
        leadId,
        propertyId: lb.property_id,
      }).catch(e => console.error("INAYA-NOTIF-032", e))
    }
  }

  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath("/admin/leads")
  return { ok: true }
}

/** Assigne un lead à un agent et le notifie (in-app + WhatsApp). */
export async function assignLead(leadId: string, agentId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur"].includes(role)) return { ok: false, error: "Action réservée au staff." }

  const admin = createAdminClient()
  // Récupère le lead (annonce + client) pour la notification.
  const { data: leadData } = await admin
    .from("leads").select("statut, contact_nom, property_id, properties(titre)").eq("id", leadId).single()
  const lead = leadData as { statut: string; contact_nom: string | null; property_id: string; properties: { titre: string } | { titre: string }[] | null } | null
  if (!lead) return { ok: false, error: "Lead introuvable." }

  const patch: Record<string, unknown> = { agent_id: agentId }
  if (lead.statut === "nouveau") { patch.statut = "en_traitement"; patch.pris_en_charge_le = new Date().toISOString() }

  const { error } = await admin.from("leads").update(patch as never).eq("id", leadId)
  if (error) { console.error("INAYA-LEAD-012", error); return { ok: false, error: "Échec de l'assignation." } }

  const titre = (Array.isArray(lead.properties) ? lead.properties[0] : lead.properties)?.titre ?? "un bien"

  // Vérifie que l'agent a un numéro WhatsApp avant d'envoyer la notification
  const { data: agentProf } = await admin.from("profiles").select("telephone").eq("id", agentId).single()
  const agentPhone = (agentProf as { telephone: string | null } | null)?.telephone ?? null

  let notifError: string | null = null
  try {
    await notifyAgentAssignment({ agentId, propertyTitre: titre, contactNom: lead.contact_nom || "un client", leadId, propertyId: lead.property_id })
  } catch (e) {
    console.error("INAYA-NOTIF-031", e)
    notifError = (e as Error).message
  }

  revalidatePath(`/admin/leads/${leadId}`)
  if (notifError) return { ok: true, warning: `Lead assigné mais notification échouée : ${notifError}` }
  if (!agentPhone) return { ok: true, warning: "Lead assigné ✓ — mais l'agent n'a pas de numéro WhatsApp dans son profil. La notification WhatsApp ne sera pas envoyée. Ajoutez son numéro dans Admin → Utilisateurs." }
  return { ok: true }
}

/**
 * Force la confirmation de prise en charge par l'agent (usage admin quand
 * la confirmation WhatsApp automatique a échoué — ex : migration non appliquée).
 * Retourne void pour être utilisable directement comme form action.
 */
export async function forceAgentConfirmation(leadId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) return

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Met à jour agent_confirmation_le sur le lead (42703 = colonne absente → migration 028 à appliquer)
  const { error: leadErr } = await admin
    .from("leads")
    .update({ agent_confirmation_le: now } as never)
    .eq("id", leadId)
  if (leadErr) {
    console.error("INAYA-FORCE-CONFIRM-001", leadErr.code, leadErr.message)
    return
  }

  // Marque le followup awaiting_confirmation comme répondu (ignoré si migration absente)
  await admin
    .from("lead_followups")
    .update({ reponse_brute: "admin_force", statut_apres: "en_traitement", repondu_le: now } as never)
    .eq("lead_id", leadId)
    .eq("awaiting_confirmation" as never, true)
    .is("repondu_le", null)

  revalidatePath(`/admin/leads/${leadId}`)
}

/** Met à jour le compte-rendu (note interne) d'un lead. */
export async function saveLeadNote(leadId: string, compteRendu: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur", "agent"].includes(role)) {
    return { ok: false, error: "Action réservée au staff." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("leads")
    .update({ compte_rendu: compteRendu.trim() || null } as never).eq("id", leadId)
  if (error) { console.error("INAYA-LEAD-011", error); return { ok: false, error: "Échec de l'enregistrement." } }

  revalidatePath(`/admin/leads/${leadId}`)
  return { ok: true }
}
