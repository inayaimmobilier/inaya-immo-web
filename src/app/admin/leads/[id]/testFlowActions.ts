"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { selectRule, computeCommission, type CommissionRule } from "@/lib/commissions"
import type { PropertyCat } from "@/types/database"

type OpType = "location" | "vente"
const toOpType = (s: string | undefined | null): OpType => s === "location" ? "location" : "vente"

// Supabase génère un type strict pour lead_status — on contourne via never pour les updates dynamiques
const updateLeadStatut = (db: ReturnType<typeof createAdminClient>, leadId: string, patch: Record<string, unknown>) =>
  db.from("leads").update(patch as never).eq("id", leadId)

// ── Types exposés au client ────────────────────────────────────────────────────

export interface LeadTestContext {
  id: string
  ref: string              // 4 chars hex du UUID
  statut: string
  agentId: string | null
  agentNom: string
  agentConfirmationLe: string | null
  confirmationCode: string | null   // code unique à envoyer par WA pour confirmer
  clientNom: string | null
  clientTel: string | null
  propertyId: string
  propertyTitre: string
  propertyQuartier: string | null
  propertyTypeOffre: string
  propertyPrix: number | null
}

export interface TestOption {
  value: string
  label: string
}

export interface TestMessage {
  context: "confirmation" | "standard" | "post_visite" | "paiement" | "done"
  waText: string        // texte WA exact qui serait envoyé
  options: TestOption[]
}

export interface TestStepResult {
  confirmText: string           // message de confirmation renvoyé à l'agent
  statusBefore: string
  statusAfter: string
  awaitingInput?: "montant" | "rdv_date"
  awaitingInputLabel?: string
  commission?: { montant: number; total: number; partInaya: number; partAgent: number }
  staffNotified?: boolean
  nextMessage?: TestMessage     // prochain suivi si applicable
  done: boolean
  error?: string
}

// ── Helpers internes ──────────────────────────────────────────────────────────

function makeRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase()
}

function contextOf(statut: string): "standard" | "post_visite" | "paiement" {
  if (statut === "visite_effectuee") return "post_visite"
  if (statut === "paiement_planifie") return "paiement"
  return "standard"
}

// ── Options standard : filtrées selon les étapes déjà franchies ──────────────

const NUM_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]

const STANDARD_ALL = [
  { target: "contacte",         label: "Je l'ai contacté" },
  { target: "visite_planifiee", label: "Visite planifiée" },
  { target: "visite_effectuee", label: "Visite effectuée" },
  { target: "conclu",           label: "Affaire conclue 🎉" },
  { target: "abandonne",        label: "Client non intéressé" },
]
// Ordre linéaire du flux standard (sans conclu/abandonne qui sont toujours valides)
const STANDARD_ORDER_LINEAR = ["en_traitement", "contacte", "visite_planifiee", "visite_effectuee"]

/** Retourne uniquement les options non encore franchies, renumérotées depuis 1. */
function getStandardOptions(currentStatut: string): { value: string; label: string; target: string }[] {
  const currentIdx = STANDARD_ORDER_LINEAR.indexOf(currentStatut)
  const filtered = STANDARD_ALL.filter(s => {
    const idx = STANDARD_ORDER_LINEAR.indexOf(s.target)
    // Garder si hors du flux linéaire (conclu, abandonne) ou si l'étape est en avant
    return idx === -1 || idx > currentIdx
  })
  return filtered.map((s, i) => ({ value: String(i + 1), label: s.label, target: s.target }))
}

/** Map chiffre → statut cible, construit dynamiquement selon le statut actuel. */
function getStandardMap(currentStatut: string): Record<string, string> {
  return Object.fromEntries(getStandardOptions(currentStatut).map(o => [o.value, o.target]))
}

// ── Constructeurs de message WA ───────────────────────────────────────────────

function buildWaText(ctx: LeadTestContext): string {
  const ref = ctx.ref
  const header = [
    ctx.propertyTitre && `🏠 *${ctx.propertyTitre}${ctx.propertyQuartier ? ` · ${ctx.propertyQuartier}` : ""}*`,
    ctx.clientNom && `👤 Client : ${ctx.clientNom}`,
    ctx.clientTel && `📞 ${ctx.clientTel}`,
  ].filter(Boolean).join("\n")

  if (ctx.statut === "visite_effectuee") {
    return [
      `*Inaya Immo — Suite de la visite [${ref}]*`, "",
      header, "",
      "Le client prend-il le bien ?",
      "1️⃣ Oui — RDV paiement caution (immédiat ou à venir) 💰",
      "2️⃣ Oui — rendez-vous paiement à planifier 📅",
      "3️⃣ Non — client ne prend pas le bien ❌",
    ].join("\n")
  }
  if (ctx.statut === "paiement_planifie") {
    return [
      `*Inaya Immo — Rappel paiement [${ref}]*`, "",
      header, "",
      "Le paiement a-t-il eu lieu ?",
      "1️⃣ Oui — paiement effectué 💰",
      "2️⃣ Non — reporter le rendez-vous 📅",
      "3️⃣ Client se désiste ❌",
    ].join("\n")
  }
  // Flux standard : uniquement les étapes en avant
  const opts = getStandardOptions(ctx.statut)
  return [
    `*Inaya Immo — Suivi tâche [${ref}]*`, "",
    header, "",
    "Où en êtes-vous ?",
    ...opts.map((o, i) => `${NUM_EMOJIS[i]} ${o.label}`),
  ].join("\n")
}

function optionsFor(statut: string): TestOption[] {
  if (statut === "visite_effectuee") return [
    { value: "1", label: "Oui — RDV paiement caution (immédiat) 💰" },
    { value: "2", label: "Oui — rendez-vous paiement à planifier 📅" },
    { value: "3", label: "Non — ne prend pas le bien ❌" },
  ]
  if (statut === "paiement_planifie") return [
    { value: "1", label: "Paiement effectué 💰" },
    { value: "2", label: "Reporter le RDV 📅" },
    { value: "3", label: "Client se désiste ❌" },
  ]
  // Flux standard : uniquement étapes en avant, renumérotées
  return getStandardOptions(statut).map(o => ({ value: o.value, label: o.label }))
}

const POST_VISITE_MAP: Record<string, string> = {
  "1": "paiement_planifie", "2": "paiement_planifie", "3": "abandonne",
}
const PAIEMENT_MAP: Record<string, string> = {
  "1": "conclu", "2": "paiement_planifie", "3": "abandonne",
}

async function computeCommissionForLead(
  db: ReturnType<typeof createAdminClient>,
  ctx: LeadTestContext,
  montant: number,
): Promise<{ total: number; partInaya: number; partAgent: number } | null> {
  const { data } = await db.from("commission_rules").select("*").eq("actif", true)
  const rules = (data ?? []) as CommissionRule[]
  const opType = toOpType(ctx.propertyTypeOffre)
  const rule = selectRule(rules, { type_operation: opType, montant })
  if (!rule) return null
  const calc = computeCommission(rule, { type_operation: opType, montant })
  return { total: calc.total, partInaya: calc.partInaya, partAgent: calc.partAgent }
}

// ── Actions publiques ─────────────────────────────────────────────────────────

/** Charge le contexte du lead pour le test (admin seulement). */
export async function getLeadTestContext(leadId: string): Promise<LeadTestContext | null> {
  const db = createAdminClient()
  type RawRow = { data: Record<string, unknown> | null; error: { code: string } | null }
  const r1 = await db
    .from("leads")
    .select("id,statut,agent_id,agent_confirmation_le,contact_nom,contact_telephone,property_id,profiles!leads_agent_id_fkey(nom,prenom),properties(titre,quartier,type_offre,prix,categorie)")
    .eq("id", leadId)
    .single() as unknown as RawRow
  let data: Record<string, unknown> | null = r1.data
  if (r1.error?.code === "42703") {
    // migration 028 non appliquée — on retente sans agent_confirmation_le
    const r2 = await db
      .from("leads")
      .select("id,statut,agent_id,contact_nom,contact_telephone,property_id,profiles!leads_agent_id_fkey(nom,prenom),properties(titre,quartier,type_offre,prix,categorie)")
      .eq("id", leadId)
      .single() as unknown as RawRow
    data = r2.data ? { ...r2.data, agent_confirmation_le: null } : null
  }
  if (!data) return null

  // Charge le code de confirmation depuis le followup en attente (migration 029)
  let confirmationCode: string | null = null
  if (!(data as Record<string, unknown>).agent_confirmation_le) {
    const cfRes = await db
      .from("lead_followups")
      .select("confirmation_code")
      .eq("lead_id", leadId)
      .eq("awaiting_confirmation" as never, true)
      .is("repondu_le", null)
      .single() as unknown as { data: { confirmation_code?: string | null } | null }
    confirmationCode = cfRes.data?.confirmation_code ?? null
  }

  const d = data as Record<string, unknown>
  const agent = d.profiles as { nom?: string | null; prenom?: string | null } | null
  const prop = (Array.isArray(d.properties) ? (d.properties as Record<string, unknown>[])[0] : d.properties) as {
    titre?: string | null; quartier?: string | null; type_offre?: string | null; prix?: number | null; categorie?: string | null
  } | null

  const id = String(d.id)
  return {
    id,
    ref: makeRef(id),
    statut: String(d.statut),
    agentId: (d.agent_id as string | null) ?? null,
    agentNom: [agent?.prenom, agent?.nom].filter(Boolean).join(" ") || "Agent non assigné",
    agentConfirmationLe: (d.agent_confirmation_le as string | null) ?? null,
    confirmationCode,
    clientNom: (d.contact_nom as string | null) ?? null,
    clientTel: (d.contact_telephone as string | null) ?? null,
    propertyId: String(d.property_id),
    propertyTitre: prop?.titre ?? "Bien immobilier",
    propertyQuartier: prop?.quartier ?? null,
    propertyTypeOffre: prop?.type_offre ?? "vente",
    propertyPrix: prop?.prix ?? null,
  }
}

/** Construit le message de notification d'assignation (étape 0 du test). */
function buildAssignmentText(ctx: LeadTestContext): string {
  const code = ctx.confirmationCode ?? "?????"
  const lines = [
    `*Nouvelle tâche assignée — Inaya Immo*`, "",
    ctx.propertyTitre && `🏠 *${ctx.propertyTitre}${ctx.propertyQuartier ? ` · ${ctx.propertyQuartier}` : ""}*`,
    ctx.clientNom && `👤 Client : ${ctx.clientNom}`,
    ctx.clientTel && `📞 ${ctx.clientTel}`,
    "",
    `🔑 *Code de confirmation : ${code}*`,
    `Envoyez ce code par WhatsApp pour confirmer la prise en charge.`,
  ].filter((v): v is string => typeof v === "string" && v.length > 0)
  return lines.join("\n")
}

/** Construit le message de suivi pour le contexte actuel du lead. */
export async function getTestFollowupMessage(leadId: string): Promise<TestMessage | null> {
  const ctx = await getLeadTestContext(leadId)
  if (!ctx) return null
  if (!ctx.agentId) return { context: "done", waText: "Aucun agent assigné à ce lead.", options: [] }

  // Étape 0 : l'agent n'a pas encore confirmé la prise en charge
  if (!ctx.agentConfirmationLe) {
    const code = ctx.confirmationCode ?? "?????"
    return {
      context: "confirmation",
      waText: buildAssignmentText(ctx),
      options: [{ value: code, label: `Envoyer le code ${code} ✅` }],
    }
  }

  if (["conclu", "abandonne"].includes(ctx.statut)) {
    return { context: "done", waText: `Ce lead est ${ctx.statut === "conclu" ? "conclu" : "abandonné"} — aucune relance à envoyer.`, options: [] }
  }
  return {
    context: contextOf(ctx.statut),
    waText: buildWaText(ctx),
    options: optionsFor(ctx.statut),
  }
}

/**
 * Traite la réponse chiffrée (1-5) d'un agent simulé.
 * applyChanges = true → modifie réellement le lead en DB.
 */
export async function processTestDigitReply(
  leadId: string,
  digit: string,
  applyChanges: boolean,
): Promise<TestStepResult> {
  const db = createAdminClient()
  const ctx = await getLeadTestContext(leadId)
  if (!ctx) return { confirmText: "Lead introuvable.", statusBefore: "", statusAfter: "", done: true, error: "Lead introuvable" }

  // ── Étape 0 : confirmation de prise en charge ─────────────────────────────
  if (!ctx.agentConfirmationLe) {
    if (applyChanges) {
      await updateLeadStatut(db, leadId, { agent_confirmation_le: new Date().toISOString() })
    }
    const updatedCtx = { ...ctx, agentConfirmationLe: new Date().toISOString() }
    const nextMsg: TestMessage = {
      context: contextOf(ctx.statut),
      waText: buildWaText(updatedCtx),
      options: optionsFor(ctx.statut),
    }
    return {
      confirmText: [
        `✅ *Tâche [${ctx.ref}] confirmée !*`,
        "",
        `Vous prenez en charge le dossier de *${ctx.clientNom ?? "le client"}* pour *${ctx.propertyTitre}*.`,
        "Vous recevrez des demandes de mise à jour régulières sur ce canal. 💪",
      ].join("\n"),
      statusBefore: ctx.statut,
      statusAfter: ctx.statut,
      nextMessage: nextMsg,
      done: false,
    }
  }

  const statusBefore = ctx.statut
  const context = contextOf(ctx.statut)
  const map = context === "post_visite" ? POST_VISITE_MAP : context === "paiement" ? PAIEMENT_MAP : getStandardMap(ctx.statut)
  const statusAfter = map[digit]

  if (!statusAfter) {
    return { confirmText: "Option invalide.", statusBefore, statusAfter: statusBefore, done: false, error: "Chiffre invalide pour ce contexte" }
  }

  // Cas : en attente du montant de transaction
  if (statusAfter === "conclu") {
    if (applyChanges) await updateLeadStatut(db, leadId, { statut: "conclu" })
    return {
      confirmText: `🎉 Tâche [${ctx.ref}] conclue ! Quel est le montant de la transaction ?`,
      statusBefore,
      statusAfter: "conclu",
      awaitingInput: "montant",
      awaitingInputLabel: "Montant en FCFA (ex : 2500000)",
      done: false,
    }
  }

  // Cas : RDV paiement — en attente de la date
  if (statusAfter === "paiement_planifie") {
    if (applyChanges) await updateLeadStatut(db, leadId, { statut: "paiement_planifie" })
    return {
      confirmText: `📅 Tâche [${ctx.ref}] — RDV paiement. Quelle est la date du rendez-vous ?`,
      statusBefore,
      statusAfter: "paiement_planifie",
      awaitingInput: "rdv_date",
      awaitingInputLabel: "Date du RDV paiement (ex : 05/07 à 10h)",
      done: false,
    }
  }

  // Cas terminal : abandonné
  if (statusAfter === "abandonne") {
    if (applyChanges) await updateLeadStatut(db, leadId, { statut: "abandonne" })
    return {
      confirmText: `❌ Tâche [${ctx.ref}] clôturée — client non intéressé.`,
      statusBefore,
      statusAfter: "abandonne",
      done: true,
    }
  }

  // Cas visite_effectuee : envoi immédiat du message post-visite
  if (statusAfter === "visite_effectuee") {
    if (applyChanges) await updateLeadStatut(db, leadId, { statut: "visite_effectuee" })
    const updatedCtx = { ...ctx, statut: "visite_effectuee" }
    const nextMsg: TestMessage = {
      context: "post_visite",
      waText: buildWaText(updatedCtx),
      options: optionsFor("visite_effectuee"),
    }
    return {
      confirmText: `✅ Tâche [${ctx.ref}] — Visite effectuée. Message post-visite envoyé à l'agent.`,
      statusBefore,
      statusAfter: "visite_effectuee",
      nextMessage: nextMsg,
      done: false,
    }
  }

  // Progression normale (contacté, visite_planifiée)
  if (applyChanges) await updateLeadStatut(db, leadId, { statut: statusAfter })

  const LABEL: Record<string, string> = {
    contacte: "✅ Client contacté",
    visite_planifiee: "📅 Visite planifiée",
  }
  const updatedCtx = { ...ctx, statut: statusAfter }
  const nextMsg: TestMessage = {
    context: contextOf(statusAfter),
    waText: buildWaText(updatedCtx),
    options: optionsFor(statusAfter),
  }
  return {
    confirmText: `*Inaya Immo — Tâche [${ctx.ref}]* ${LABEL[statusAfter] ?? statusAfter} ✓`,
    statusBefore,
    statusAfter,
    nextMessage: nextMsg,
    done: false,
  }
}

/**
 * Traite une saisie texte (montant ou date RDV).
 * applyChanges = true → crée réellement la transaction / met à jour le RDV.
 */
export async function processTestInputReply(
  leadId: string,
  input: string,
  inputType: "montant" | "rdv_date",
  applyChanges: boolean,
): Promise<TestStepResult> {
  const db = createAdminClient()
  const ctx = await getLeadTestContext(leadId)
  if (!ctx) return { confirmText: "Lead introuvable.", statusBefore: "", statusAfter: "", done: true, error: "Lead introuvable" }

  if (inputType === "rdv_date") {
    if (applyChanges) {
      // Stocke la date (best-effort parsing)
      let rdv = new Date(Date.now() + 3 * 86400000)
      const m = input.match(/(\d{1,2})[\/\-](\d{1,2})/)
      if (m) {
        const d = new Date(new Date().getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]), 10)
        if (!isNaN(d.getTime()) && d > new Date()) rdv = d
      }
      await updateLeadStatut(db, leadId, { statut: "paiement_planifie", rdv_paiement_le: rdv.toISOString() })
    }
    return {
      confirmText: `📅 Tâche [${ctx.ref}] — RDV paiement enregistré : *${input}*\nUne relance sera envoyée à cette date.`,
      statusBefore: ctx.statut,
      statusAfter: "paiement_planifie",
      done: true,
    }
  }

  // Montant de transaction
  const montant = parseInt(input.replace(/[\s.,]/g, ""), 10)
  if (isNaN(montant) || montant <= 0) {
    return {
      confirmText: "Montant invalide. Entrez un nombre entier en FCFA (ex : 2500000).",
      statusBefore: ctx.statut,
      statusAfter: ctx.statut,
      awaitingInput: "montant",
      awaitingInputLabel: "Montant en FCFA (ex : 2500000)",
      done: false,
      error: "Montant invalide",
    }
  }

  const commission = await computeCommissionForLead(db, ctx, montant)

  if (applyChanges && ctx.agentId) {
    const { data: propData } = await db
      .from("properties").select("type_offre,categorie").eq("id", ctx.propertyId).single()
    const prop = propData as { type_offre: string | null; categorie: PropertyCat | null } | null
    const opType = toOpType(prop?.type_offre)
    const { data: rulesData } = await db.from("commission_rules").select("*").eq("actif", true)
    const rules = (rulesData ?? []) as CommissionRule[]
    const rule = selectRule(rules, { type_operation: opType, categorie: prop?.categorie ?? undefined, montant })
    const calc = rule ? computeCommission(rule, { type_operation: opType, categorie: prop?.categorie ?? undefined, montant }) : null
    await db.from("transactions").insert({
      lead_id: leadId,
      property_id: ctx.propertyId,
      agent_id: ctx.agentId,
      type_operation: ctx.propertyTypeOffre,
      montant_transaction: montant,
      commission_rule_id: rule?.id ?? null,
      commission_montant_total: calc?.total ?? 0,
      commission_part_inaya: calc?.partInaya ?? 0,
      commission_part_agent: calc?.partAgent ?? 0,
      statut: "en_cours",
      created_by: ctx.agentId,
    } as never)
  }

  const fmt = (n: number) => n.toLocaleString("fr-FR") + " FCFA"
  const commMsg = commission
    ? `\n\n💼 Commission Inaya : *${fmt(commission.partInaya)}*\n🤝 Votre commission : *${fmt(commission.partAgent)}*`
    : ""

  return {
    confirmText: `✅ *Transaction : ${fmt(montant)}*\nTâche [${ctx.ref}] clôturée.${commMsg}\n\nMerci pour votre excellent travail ! 🙌`,
    statusBefore: ctx.statut,
    statusAfter: "conclu",
    commission: commission ? { montant, ...commission } : undefined,
    done: true,
  }
}
