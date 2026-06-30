// ============================================================================
// Moteur de commission Inaya — sélection de règle + calcul.
// Fonctions PURES, partagées entre le simulateur (back-office) et le calcul
// effectif des transactions. Aucune dépendance Supabase ici.
// ============================================================================

import type {
  CommissionMode, OperationType, PropertyCat, PropertySource,
} from "@/types/database"

export interface CommissionRule {
  id: string
  nom: string
  priorite: number
  actif: boolean
  est_defaut: boolean
  type_operation: OperationType
  categories: PropertyCat[] | null
  zones: string[] | null
  prix_min: number | null
  prix_max: number | null
  source: PropertySource | null
  agent_id: string | null
  contexte_tag: string | null
  mode_calcul: CommissionMode
  valeur: number
  montant_min: number | null
  montant_max: number | null
  split_agent_pct: number
  valide_du: string | null
  valide_au: string | null
}

/** Contexte d'une opération à tarifer. */
export interface CommissionContext {
  type_operation: "location" | "vente"
  categorie?: PropertyCat
  zone?: string
  /** Montant de référence : prix de vente, ou loyer mensuel en location. */
  montant: number
  source?: PropertySource
  agent_id?: string
  contexte_tag?: string
  /** Date de l'opération (défaut : maintenant) pour la fenêtre de validité. */
  date?: Date
}

export const COMMISSION_MODE_LABEL: Record<CommissionMode, string> = {
  pct_prix: "% du prix de vente",
  pct_loyer: "% du loyer mensuel",
  nb_mois: "Nombre de mois de loyer",
  fixe: "Montant fixe",
  combine: "Combiné (% + plancher/plafond)",
}

export const OPERATION_LABEL: Record<OperationType, string> = {
  location: "Location",
  vente: "Vente",
  tous: "Tous types",
}

/** Une règle correspond-elle au contexte ? (hors priorité / défaut) */
export function ruleMatches(rule: CommissionRule, ctx: CommissionContext): boolean {
  if (!rule.actif) return false

  // Type d'opération
  if (rule.type_operation !== "tous" && rule.type_operation !== ctx.type_operation) return false

  // Catégorie
  if (rule.categories && rule.categories.length > 0) {
    if (!ctx.categorie || !rule.categories.includes(ctx.categorie)) return false
  }

  // Zone (comparaison insensible à la casse / accents simplifiée)
  if (rule.zones && rule.zones.length > 0) {
    const z = (ctx.zone || "").trim().toLowerCase()
    if (!z || !rule.zones.some(rz => rz.trim().toLowerCase() === z)) return false
  }

  // Fourchette de prix/loyer
  if (rule.prix_min != null && ctx.montant < rule.prix_min) return false
  if (rule.prix_max != null && ctx.montant > rule.prix_max) return false

  // Source
  if (rule.source && rule.source !== ctx.source) return false

  // Agent spécifique
  if (rule.agent_id && rule.agent_id !== ctx.agent_id) return false

  // Tag de contexte (promo, période…)
  if (rule.contexte_tag && rule.contexte_tag !== ctx.contexte_tag) return false

  // Fenêtre de validité
  const now = ctx.date ?? new Date()
  if (rule.valide_du && now < new Date(rule.valide_du)) return false
  if (rule.valide_au && now > new Date(rule.valide_au)) return false

  return true
}

/**
 * Sélectionne la règle applicable : la règle active correspondante de plus
 * haute priorité ; à défaut, la règle marquée est_defaut (fallback).
 */
export function selectRule(rules: CommissionRule[], ctx: CommissionContext): CommissionRule | null {
  const matches = rules
    .filter(r => ruleMatches(r, ctx))
    .sort((a, b) => b.priorite - a.priorite)

  if (matches.length > 0) return matches[0]

  // Fallback : règle par défaut active
  return rules.find(r => r.est_defaut && r.actif) ?? null
}

export interface CommissionResult {
  rule: CommissionRule
  /** Commission brute avant clamp min/max. */
  brut: number
  /** Commission finale après plancher/plafond. */
  total: number
  /** Part reversée à l'agent. */
  partAgent: number
  /** Part conservée par Inaya. */
  partInaya: number
  /** true si un plancher/plafond a modifié le brut. */
  clamped: boolean
}

/** Calcule la commission pour une règle + un contexte donné. */
export function computeCommission(rule: CommissionRule, ctx: CommissionContext): CommissionResult {
  const m = ctx.montant
  let brut = 0

  switch (rule.mode_calcul) {
    case "pct_prix":
    case "pct_loyer":
    case "combine":
      // valeur exprimée en pourcentage (ex. 5 => 5 %)
      brut = (m * rule.valeur) / 100
      break
    case "nb_mois":
      // valeur = nombre de mois de loyer
      brut = m * rule.valeur
      break
    case "fixe":
      brut = rule.valeur
      break
  }

  // Plancher / plafond
  let total = brut
  if (rule.montant_min != null) total = Math.max(total, rule.montant_min)
  if (rule.montant_max != null) total = Math.min(total, rule.montant_max)
  const clamped = total !== brut

  const partAgent = Math.round((total * rule.split_agent_pct) / 100)
  const partInaya = Math.round(total - partAgent)

  return { rule, brut: Math.round(brut), total: Math.round(total), partAgent, partInaya, clamped }
}

/** Résumé court des critères d'une règle, pour affichage en liste. */
export function ruleCriteresSummary(rule: CommissionRule): string {
  const parts: string[] = []
  parts.push(OPERATION_LABEL[rule.type_operation])
  if (rule.categories?.length) parts.push(rule.categories.join(", "))
  if (rule.zones?.length) parts.push(rule.zones.join(", "))
  if (rule.prix_min != null || rule.prix_max != null) {
    const min = rule.prix_min != null ? rule.prix_min.toLocaleString("fr-FR") : "0"
    const max = rule.prix_max != null ? rule.prix_max.toLocaleString("fr-FR") : "∞"
    parts.push(`${min}–${max} XOF`)
  }
  if (rule.source) parts.push(`source: ${rule.source}`)
  if (rule.contexte_tag) parts.push(`#${rule.contexte_tag}`)
  return parts.join(" · ")
}
