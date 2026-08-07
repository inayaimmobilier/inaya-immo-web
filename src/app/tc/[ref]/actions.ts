"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { resoudreTache } from "@/lib/garde-tache"

type Res = { ok: true } | { ok: false; error: string }

/** Normalise la référence courte (4 caractères) reçue dans l'URL du bouton WhatsApp. */
export async function normalizeRef(raw: string): Promise<string> {
  return String(raw).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)
}

/**
 * L'agent CONFIRME la prise en charge de la tâche depuis le bouton WhatsApp.
 * Même effet que l'ancienne confirmation par code (« T8DKS ») : on horodate
 * `leads.agent_confirmation_le`, on clôt le followup en attente de confirmation
 * et on passe le lead en « en_traitement ».
 *
 * Sécurité : le jeton porte une SIGNATURE (voir `jetonTache`). La référence
 * courte seule ne prouvait rien — quatre caractères hexadécimaux dérivés de
 * l'UUID du lead, donc devinables et énumérables.
 */
export async function confirmTask(refRaw: string): Promise<Res> {
  const t = await resoudreTache(refRaw)
  if (!t.ok) return t
  const leadId = t.leadId

  const admin = createAdminClient()

  const now = new Date().toISOString()

  // Horodate la confirmation (42703 = colonne absente → migration 028 non appliquée).
  const { error: leadErr } = await admin.from("leads")
    .update({ agent_confirmation_le: now, statut: "en_traitement", pris_en_charge_le: now } as never)
    .eq("id", leadId)
  if (leadErr) {
    console.error("INAYA-TASK-CONFIRM-001", leadErr.code, leadErr.message)
    return { ok: false, error: "Confirmation impossible pour le moment." }
  }

  // Clôt le followup en attente de confirmation (best-effort).
  await admin.from("lead_followups")
    .update({ reponse_brute: "bouton_whatsapp", statut_apres: "en_traitement", repondu_le: now } as never)
    .eq("lead_id", leadId)
    .eq("awaiting_confirmation" as never, true)
    .is("repondu_le", null)

  return { ok: true }
}
