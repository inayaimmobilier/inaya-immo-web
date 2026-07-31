// ============================================================================
// Contrôle d'accès du bot admin.
//   Le webhook n'a AUCUNE session : l'identité vient uniquement du chat_id
//   Telegram, préalablement lié à un profil par le lien /start signé. On
//   revérifie le rôle à CHAQUE message — révoquer un accès dans le back-office
//   doit couper l'accès Telegram immédiatement.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

export type StaffRole = "super_admin" | "admin" | "moderateur" | "agent"

export interface TgUser {
  id: string; nom: string; role: StaffRole
  /** Actions destructrices (suppression, comptes) réservées aux admins. */
  peutSupprimer: boolean
  peutGererComptes: boolean
}

const ROLES: StaffRole[] = ["super_admin", "admin", "moderateur", "agent"]

/** Profil staff associé à ce chat Telegram, ou null si non autorisé. */
export async function whoIs(chatId: string): Promise<TgUser | null> {
  const admin = createAdminClient()
  // La colonne s'appelle `status` (valeurs : actif | suspendu | banni) et NON
  // `statut` : une erreur de nom ici renvoie 42703, donc `data` à null, donc un
  // refus d'accès pour absolument tout le monde.
  // Pas de `maybeSingle()` ici : il ÉCHOUE si plusieurs profils portent le même
  // chat_id (cas réellement rencontré en base). On prend les candidats et on
  // retient le plus privilégié, pour ne jamais dégrader l'accès d'un admin.
  const { data, error } = await admin.from("profiles")
    .select("id,nom,prenom,role,status")
    .eq("telegram_chat_id", chatId)
    .limit(10)
  if (error) { console.error("INAYA-TG-WHOIS", error.code, error.message); return null }

  const rows = (data ?? []) as { id: string; nom: string | null; prenom: string | null; role: string; status: string | null }[]
  const eligibles = rows.filter(r => ROLES.includes(r.role as StaffRole) && (!r.status || r.status === "actif"))
  if (!eligibles.length) return null
  if (rows.length > 1) console.warn("INAYA-TG-WHOIS-DUP", chatId, rows.length, "profils partagent ce chat")
  const p = eligibles.sort((a, b) => ROLES.indexOf(a.role as StaffRole) - ROLES.indexOf(b.role as StaffRole))[0]

  const role = p.role as StaffRole
  return {
    id: p.id,
    nom: `${p.prenom || ""} ${p.nom || ""}`.trim() || "Administrateur",
    role,
    peutSupprimer: role === "super_admin" || role === "admin",
    peutGererComptes: role === "super_admin" || role === "admin",
  }
}

// ── État de conversation (édition en cours, confirmation en attente) ────────

export interface TgState { kind: string; [k: string]: unknown }
export interface Turn { role: "user" | "assistant"; text: string }

/** Ligne d'état : `kind` = étape en cours, `h` = historique de conversation. */
interface Row { state: Record<string, unknown> & { h?: Turn[] }; updated_at: string }

const MAX_TURNS = 12          // ~6 échanges : assez pour le contexte, pas pour noyer le modèle
const STEP_TTL = 30 * 60_000  // une étape oubliée ne doit pas piéger l'admin
const CHAT_TTL = 3 * 3600_000 // au-delà, on repart sur une conversation neuve

async function readRow(chatId: string): Promise<Row | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from("telegram_admin_state")
    .select("state,updated_at").eq("chat_id", chatId).maybeSingle()
  if (error) { console.error("INAYA-TG-STATE-READ", error.code, error.message); return null }
  return (data as Row | null) ?? null
}

/** Écrit en FUSIONNANT : sauvegarder une étape ne doit pas effacer l'historique. */
async function patchRow(chatId: string, profileId: string, patch: Record<string, unknown>): Promise<boolean> {
  const current = (await readRow(chatId))?.state ?? {}
  const admin = createAdminClient()
  const { error } = await admin.from("telegram_admin_state").upsert({
    chat_id: chatId, profile_id: profileId,
    state: { ...current, ...patch }, updated_at: new Date().toISOString(),
  } as never, { onConflict: "chat_id" })
  if (error) { console.error("INAYA-TG-STATE", error.code, error.message); return false }
  return true
}

export async function getState(chatId: string): Promise<TgState | null> {
  const row = await readRow(chatId)
  const kind = row?.state?.kind
  if (typeof kind !== "string" || !kind) return null
  if (Date.now() - new Date(row!.updated_at).getTime() > STEP_TTL) return null
  return row!.state as TgState
}

/**
 * Mémorise l'étape en cours. Renvoie false si la table n'existe pas encore
 * (migration 051 non appliquée) : le reste du bot continue de fonctionner, seules
 * les actions en deux temps sont indisponibles — et on le dit à l'administrateur
 * plutôt que de le laisser envoyer un prix dans le vide.
 */
export function setState(chatId: string, profileId: string, state: TgState | null): Promise<boolean> {
  return patchRow(chatId, profileId, state ?? { kind: null })
}

export const clearState = (chatId: string, profileId: string) => setState(chatId, profileId, null)

// ── Mémoire de conversation ─────────────────────────────────────────────────

export async function getHistory(chatId: string): Promise<Turn[]> {
  const row = await readRow(chatId)
  if (!row?.state?.h?.length) return []
  if (Date.now() - new Date(row.updated_at).getTime() > CHAT_TTL) return []
  return row.state.h.slice(-MAX_TURNS)
}

export async function pushHistory(chatId: string, profileId: string, turns: Turn[]): Promise<void> {
  const previous = (await readRow(chatId))?.state?.h ?? []
  await patchRow(chatId, profileId, { h: [...previous, ...turns].slice(-MAX_TURNS) })
}

export async function resetHistory(chatId: string, profileId: string): Promise<void> {
  await patchRow(chatId, profileId, { h: [] })
}
