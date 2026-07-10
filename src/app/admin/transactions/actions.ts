"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { selectRule, computeCommission, type CommissionRule } from "@/lib/commissions"
import type { UserRole, TransactionStatus, PaymentMode, PropertyCat, PropertyType } from "@/types/database"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function requireAdmin(): Promise<{ id: string; db: SupabaseClient } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const profile = data as { role: UserRole } | null
  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) return null
  return { id: user.id, db: supabase }
}

/** Crée une transaction et calcule la commission via le moteur partagé. */
export async function createTransaction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const propertyId = String(form.get("property_id") || "")
  const montant = Number(form.get("montant_transaction") || 0)
  const agentId = String(form.get("agent_id") || "") || null
  const modePaiement = (String(form.get("mode_paiement") || "") || null) as PaymentMode | null
  const note = String(form.get("note_admin") || "").trim() || null

  if (!propertyId) return { ok: false, error: "Sélectionnez un bien." }
  if (!montant || montant <= 0) return { ok: false, error: "Le montant de la transaction est invalide." }

  // Caractéristiques du bien (pour la sélection de règle)
  const { data: propData } = await admin.db
    .from("properties")
    .select("type_offre, categorie, quartier, zone_id")
    .eq("id", propertyId).single()
  const prop = propData as { type_offre: PropertyType; categorie: PropertyCat; quartier: string | null } | null
  if (!prop) return { ok: false, error: "Bien introuvable." }

  // Règles actives
  const { data: rulesData } = await admin.db
    .from("commission_rules").select("*").eq("actif", true)
  const rules = (rulesData ?? []) as CommissionRule[]

  const ctx = {
    type_operation: prop.type_offre as "location" | "vente",
    categorie: prop.categorie,
    zone: prop.quartier ?? undefined,
    montant,
  }
  const rule = selectRule(rules, ctx)
  const calc = rule ? computeCommission(rule, ctx) : null

  const payload = {
    property_id: propertyId,
    type_operation: prop.type_offre,
    montant_transaction: montant,
    commission_rule_id: rule?.id ?? null,
    commission_montant_total: calc?.total ?? 0,
    commission_part_inaya: calc?.partInaya ?? 0,
    commission_part_agent: calc?.partAgent ?? 0,
    agent_id: agentId,
    statut: "en_cours" as TransactionStatus,
    mode_paiement: modePaiement,
    note_admin: note,
    created_by: admin.id,
  }

  const { data, error } = await admin.db
    .from("transactions").insert(payload as never).select("id").single()
  if (error) {
    console.error("INAYA-PAY-001", error)
    return { ok: false, error: "Échec de la création de la transaction." }
  }
  revalidatePath("/admin/transactions")
  return { ok: true, id: (data as { id: string }).id }
}

/** Change le statut d'une transaction (workflow de paiement). */
export async function updateTransactionStatus(id: string, statut: TransactionStatus): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const patch: Record<string, unknown> = { statut }
  if (statut === "payee") patch.paye_le = new Date().toISOString()

  const { error } = await admin.db.from("transactions").update(patch as never).eq("id", id)
  if (error) {
    console.error("INAYA-PAY-002", error)
    return { ok: false, error: "Échec du changement de statut." }
  }
  revalidatePath("/admin/transactions")
  return { ok: true }
}

/** Modifie une transaction (montant, agent, mode, note) et RECALCULE la commission. */
export async function updateTransaction(id: string, input: {
  montant?: number; agent_id?: string | null; mode_paiement?: PaymentMode | null; note_admin?: string | null
}): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const { data: txData } = await admin.db
    .from("transactions").select("property_id, montant_transaction, agent_id, mode_paiement, note_admin").eq("id", id).single()
  const tx = txData as { property_id: string; montant_transaction: number; agent_id: string | null; mode_paiement: PaymentMode | null; note_admin: string | null } | null
  if (!tx) return { ok: false, error: "Transaction introuvable." }

  const montant = input.montant != null && input.montant > 0 ? input.montant : tx.montant_transaction
  const agentId = input.agent_id !== undefined ? input.agent_id : tx.agent_id

  // Recalcule la commission sur le nouveau montant.
  const { data: propData } = await admin.db.from("properties").select("type_offre, categorie, quartier").eq("id", tx.property_id).single()
  const prop = propData as { type_offre: PropertyType; categorie: PropertyCat; quartier: string | null } | null
  const { data: rulesData } = await admin.db.from("commission_rules").select("*").eq("actif", true)
  const rules = (rulesData ?? []) as CommissionRule[]
  let calc: { total: number; partInaya: number; partAgent: number } | null = null
  let ruleId: string | null = null
  if (prop) {
    const ctx = { type_operation: prop.type_offre as "location" | "vente", categorie: prop.categorie, zone: prop.quartier ?? undefined, montant }
    const rule = selectRule(rules, ctx)
    if (rule) { calc = computeCommission(rule, ctx); ruleId = rule.id }
  }

  const patch: Record<string, unknown> = {
    montant_transaction: montant, agent_id: agentId,
    mode_paiement: input.mode_paiement !== undefined ? input.mode_paiement : tx.mode_paiement,
    note_admin: input.note_admin !== undefined ? input.note_admin : tx.note_admin,
  }
  if (calc) { patch.commission_rule_id = ruleId; patch.commission_montant_total = calc.total; patch.commission_part_inaya = calc.partInaya; patch.commission_part_agent = calc.partAgent }

  const { error } = await admin.db.from("transactions").update(patch as never).eq("id", id)
  if (error) { console.error("INAYA-PAY-003", error); return { ok: false, error: "Échec de la modification." } }
  revalidatePath("/admin/transactions")
  return { ok: true }
}

/** Supprime une transaction. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }
  const { error } = await admin.db.from("transactions").delete().eq("id", id)
  if (error) { console.error("INAYA-PAY-004", error); return { ok: false, error: "Échec de la suppression." } }
  revalidatePath("/admin/transactions")
  return { ok: true }
}

export async function createTransactionAndRedirect(form: FormData) {
  const res = await createTransaction(form)
  if (!res.ok) redirect(`/admin/transactions/nouvelle?error=${encodeURIComponent(res.error)}`)
  redirect("/admin/transactions?ok=created")
}
