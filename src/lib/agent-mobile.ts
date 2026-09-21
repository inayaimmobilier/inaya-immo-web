// ============================================================================
// GARDE-BARRIÈRE DE L'APPLICATION DES AGENTS.
//
// Même principe que « Inaya Admin » : l'application ne parle jamais à Supabase
// en direct, elle passe par /api/agent/mobile/*. Aucune clé de base dans
// l'APK — un téléphone d'agent se perd sur le terrain, se prête, se revend.
//
// ── LA RÈGLE DE VISIBILITÉ (décision du DG, 2026-09-20) ────────────────────
//
// Un client appartient à l'agent qui l'a enregistré. Les autres agents le
// VOIENT — pour ne pas démarcher deux fois la même personne — mais seul le
// propriétaire de la fiche la modifie et fait avancer ses propositions.
//
// Ces routes s'exécutent avec la clé de service : la RLS ne les protège PAS.
// C'est donc ici, et dans chaque route, que la règle doit être appliquée à la
// main. `verrou()` existe pour qu'on ne l'oublie nulle part.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

export type RoleAgent = "super_admin" | "admin" | "moderateur" | "agent"

const ROLES_AUTORISES: RoleAgent[] = ["super_admin", "admin", "moderateur", "agent"]
const ADMINISTRATION: RoleAgent[] = ["super_admin", "admin"]

export interface Agent {
  userId: string
  role: RoleAgent
  nom: string | null
  telephone: string | null
}

/** Identifie l'agent derrière une requête, ou `null` si le compte n'y a pas droit. */
export async function agentDepuisEntete(header: string | null): Promise<Agent | null> {
  const userId = userIdFromAuthHeader(header)
  if (!userId) return null
  const { data } = await createAdminClient()
    .from("profiles").select("id,nom,prenom,role,telephone").eq("id", userId).maybeSingle()
  const p = data as {
    id: string; nom: string | null; prenom: string | null
    role: string | null; telephone: string | null
  } | null
  if (!p?.role || !ROLES_AUTORISES.includes(p.role as RoleAgent)) return null
  return {
    userId: p.id,
    role: p.role as RoleAgent,
    nom: `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || null,
    telephone: p.telephone,
  }
}

export const estAdministration = (role: RoleAgent) => ADMINISTRATION.includes(role)

/**
 * Le propriétaire de la fiche, ou l'administration, peut écrire. Personne
 * d'autre — c'est ce qui protège le travail de prospection d'un agent.
 */
export function peutEcrire(agent: Agent, proprietaireId: string | null | undefined): boolean {
  return estAdministration(agent.role) || proprietaireId === agent.userId
}

/**
 * Charge une fiche client et vérifie le droit d'écriture en une fois.
 *
 * Renvoie soit la fiche, soit la réponse d'erreur à retourner telle quelle.
 * Deux cas distincts, et c'est important : une fiche INTROUVABLE et une fiche
 * qui appartient à un collègue ne se disent pas de la même façon.
 */
export async function verrou(
  agent: Agent,
  clientId: string,
  mode: "lecture" | "ecriture",
): Promise<{ client: FicheClient } | { echec: Response }> {
  const { data } = await createAdminClient()
    .from("agent_clients").select("*").eq("id", clientId).maybeSingle()
  const client = data as FicheClient | null
  if (!client) return { echec: Response.json({ error: "client_introuvable" }, { status: 404 }) }
  if (mode === "ecriture" && !peutEcrire(agent, client.agent_id)) {
    return { echec: Response.json({ error: "fiche_d_un_collegue" }, { status: 403 }) }
  }
  return { client }
}

export interface FicheClient {
  id: string
  agent_id: string
  profile_id: string | null
  nom: string
  telephone: string
  telephone_2: string | null
  email: string | null
  quartier: string | null
  ville: string | null
  profession: string | null
  canal: string
  source_detail: string | null
  statut: string
  relance_le: string | null
  notes: string | null
  satisfaction: number | null
  cloture_motif: string | null
  cloture_le: string | null
  created_at: string
  updated_at: string
}

// ── Vocabulaires partagés avec l'application ────────────────────────────────

export const CANAUX = ["terrain", "whatsapp", "appel", "bureau", "site", "recommandation", "autre"] as const
export const STATUTS_CLIENT = ["actif", "en_attente", "conclu", "perdu"] as const

/**
 * Les étapes d'une proposition, DANS L'ORDRE où elles se produisent.
 *
 * L'ordre n'est pas décoratif : l'application propose l'étape suivante en
 * premier, parce que c'est celle que l'agent choisit neuf fois sur dix.
 */
export const ETAPES_PROPOSITION = [
  "proposee", "vue", "visite_planifiee", "visite_effectuee",
  "interesse", "refusee", "conclue", "abandonnee",
] as const

export const TYPES_EVENEMENT = [
  "note", "appel", "whatsapp", "sms", "visite", "rendez_vous",
  "proposition", "changement_statut", "relance",
] as const

/** Réponse d'erreur normalisée — l'app distingue 401 (reconnexion) et 403. */
export function refus(raison: "non_authentifie" | "acces_refuse"): Response {
  return Response.json({ error: raison }, { status: raison === "non_authentifie" ? 401 : 403 })
}

/**
 * Dix derniers chiffres, comme la colonne générée en base.
 *
 * Sert à repérer un doublon AVANT l'insertion, pour répondre « ce numéro est
 * déjà dans votre carnet » plutôt qu'une violation de contrainte incompréhensible.
 */
export function numeroNormalise(brut: string): string {
  return brut.replace(/\D/g, "").slice(-10)
}

/**
 * Une date « AAAA-MM-JJ » réellement valide, ou `null`, ou une erreur.
 *
 * L'application normalise déjà ce que l'agent tape, mais le serveur ne peut
 * pas s'y fier : une version ancienne de l'APK, ou un appel direct, enverrait
 * « 2026 09 22 ». Passée telle quelle à Postgres, cette chaîne fait échouer la
 * requête entière — et l'agent voit « erreur 500 » au lieu de « corrigez la
 * date ».
 */
export function jourIso(v: unknown): { ok: true; valeur: string | null } | { ok: false } {
  if (v === null || v === undefined || v === "") return { ok: true, valeur: null }
  const t = String(v).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: false }

  const [a, m, j] = t.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  // Le 31 avril deviendrait le 1er mai : si la date reconstruite diffère,
  // c'est que le jour saisi n'existe pas.
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return { ok: false }
  return { ok: true, valeur: t }
}

/** Un instant complet, pour un rendez-vous de visite. */
export function instantIso(v: unknown): { ok: true; valeur: string | null } | { ok: false } {
  if (v === null || v === undefined || v === "") return { ok: true, valeur: null }
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return { ok: false }
  return { ok: true, valeur: d.toISOString() }
}
