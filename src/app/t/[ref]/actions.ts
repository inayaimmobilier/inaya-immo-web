"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { selectRule, computeCommission, type CommissionRule } from "@/lib/commissions"
import type { PropertyCat, PropertyType } from "@/types/database"

type Res = { ok: true; commission?: { inaya: number; agent: number } } | { ok: false; error: string }

/** Retrouve le lead + agent à partir du numéro de tâche (ref). */
async function findLead(ref: string): Promise<{ leadId: string; agentId: string | null } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("lead_followups")
    .select("lead_id, agent_id").eq("ref", ref.toUpperCase())
    .order("envoye_le", { ascending: false }).limit(1).maybeSingle()
  const f = data as { lead_id: string; agent_id: string | null } | null
  return f ? { leadId: f.lead_id, agentId: f.agent_id } : null
}

/** Clôt les relances non répondues du lead (le scheduler ne re-relance plus). */
async function markAnswered(admin: ReturnType<typeof createAdminClient>, leadId: string, statutApres: string) {
  await admin.from("lead_followups")
    .update({ repondu_le: new Date().toISOString(), statut_apres: statutApres } as never)
    .eq("lead_id", leadId).is("repondu_le", null)
}

const ALLOWED = ["contacte", "visite_planifiee", "visite_effectuee", "abandonne"]

/** Met à jour le statut d'une tâche (hors « conclue » qui a son propre flux montant). */
export async function setTaskStatus(ref: string, statut: string): Promise<Res> {
  if (!ALLOWED.includes(statut)) return { ok: false, error: "Statut invalide." }
  const found = await findLead(ref)
  if (!found) return { ok: false, error: "Tâche introuvable ou déjà traitée." }
  const admin = createAdminClient()
  await admin.from("leads").update({ statut } as never).eq("id", found.leadId)
  await markAnswered(admin, found.leadId, statut)
  return { ok: true }
}

/** « Affaire conclue » : statut conclu + création de la transaction et commission. */
export async function concludeTask(ref: string, montant: number): Promise<Res> {
  if (!Number.isFinite(montant) || montant <= 0) return { ok: false, error: "Montant invalide." }
  const found = await findLead(ref)
  if (!found) return { ok: false, error: "Tâche introuvable ou déjà traitée." }
  const admin = createAdminClient()

  const { data: leadData } = await admin.from("leads")
    .select("property_id, properties(type_offre, categorie, quartier)").eq("id", found.leadId).single()
  const lead = leadData as { property_id: string; properties: { type_offre: PropertyType; categorie: PropertyCat; quartier: string | null } | { type_offre: PropertyType; categorie: PropertyCat; quartier: string | null }[] | null } | null
  const prop = lead ? (Array.isArray(lead.properties) ? lead.properties[0] : lead.properties) : null

  await admin.from("leads").update({ statut: "conclu" } as never).eq("id", found.leadId)
  await markAnswered(admin, found.leadId, "conclu")

  let commission: { inaya: number; agent: number } | undefined
  if (lead && prop) {
    const { data: rulesData } = await admin.from("commission_rules").select("*").eq("actif", true)
    const rules = (rulesData ?? []) as CommissionRule[]
    const ctx = { type_operation: prop.type_offre as "location" | "vente", categorie: prop.categorie, zone: prop.quartier ?? undefined, montant }
    const rule = selectRule(rules, ctx)
    const calc = rule ? computeCommission(rule, ctx) : null
    const { error } = await admin.from("transactions").insert({
      property_id: lead.property_id, type_operation: prop.type_offre, montant_transaction: montant,
      commission_rule_id: rule?.id ?? null, commission_montant_total: calc?.total ?? 0,
      commission_part_inaya: calc?.partInaya ?? 0, commission_part_agent: calc?.partAgent ?? 0,
      agent_id: found.agentId, statut: "en_cours", created_by: found.agentId,
    } as never)
    if (error) console.error("INAYA-TASK-CONCLU", error)
    if (calc) commission = { inaya: calc.partInaya, agent: calc.partAgent }
  }
  return { ok: true, commission }
}
