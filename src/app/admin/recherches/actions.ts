"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { phoneMatchCandidates, normalizePhone } from "@/lib/phone"
import { runMatchingForRequest } from "@/lib/matching"
import type { UserRole, PropertyType, PropertyCat, RequestStatus } from "@/types/database"

type Res = { ok: true; matched?: number } | { ok: false; error: string }

const STAFF: UserRole[] = ["super_admin", "admin", "moderateur", "agent"]
const STATUSES: RequestStatus[] = ["active", "satisfaite", "expiree"]

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null as UserRole | null }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  return { user, role: (data as { role: UserRole } | null)?.role ?? null }
}

export interface SearchInput {
  contact_telephone: string
  contact_nom?: string | null
  type_offre?: PropertyType | null
  categories?: PropertyCat[] | null
  budget_min?: number | null
  budget_max?: number | null
  zones?: string[] | null
  nb_pieces_min?: number | null
  meuble?: boolean | null
  description_libre?: string | null
}

function cleanInput(input: SearchInput) {
  const clean = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : null)
  const arr = (a: string[] | null | undefined) => {
    const list = (a ?? []).map(s => s.trim()).filter(Boolean)
    return list.length ? list : null
  }
  return {
    contact_telephone: normalizePhone(input.contact_telephone),
    contact_nom: input.contact_nom?.trim() || null,
    type_offre: input.type_offre || null,
    categories: (input.categories ?? []).length ? input.categories : null,
    budget_min: clean(input.budget_min),
    budget_max: clean(input.budget_max),
    zones: arr(input.zones),
    nb_pieces_min: clean(input.nb_pieces_min),
    meuble: input.meuble ?? null,
    description_libre: input.description_libre?.trim() || null,
  }
}

/**
 * Crée une recherche sauvegardée AU NOM d'un client (admin/modérateur/agent).
 * - lie le compte du client si son numéro correspond à un profil (il la verra
 *   dans son espace + future app mobile) ;
 * - mémorise le créateur (created_by) pour l'alerter EN PLUS du client ;
 * - lance le matching immédiat : les biens déjà en ligne sont notifiés tout de suite.
 */
export async function createSearchForClient(input: SearchInput): Promise<Res> {
  const { user, role } = await requireStaff()
  if (!user || !role || !STAFF.includes(role)) return { ok: false, error: "Action réservée au staff." }

  const c = cleanInput(input)
  if (c.contact_telephone.replace(/\D/g, "").length < 8) return { ok: false, error: "Numéro de téléphone du client invalide." }

  const admin = createAdminClient()

  // Rattache le compte client existant (matching tolérant local ⇄ +225).
  const { data: prof } = await admin.from("profiles")
    .select("id, nom").in("telephone", phoneMatchCandidates(c.contact_telephone)).limit(1)
  const clientId = ((prof ?? []) as { id: string; nom: string | null }[])[0]?.id ?? null
  const clientNom = ((prof ?? []) as { id: string; nom: string | null }[])[0]?.nom ?? null

  const row: Record<string, unknown> = {
    user_id: clientId,
    contact_telephone: c.contact_telephone,
    contact_nom: c.contact_nom ?? clientNom,
    canal: "interne",
    type_offre: c.type_offre,
    categories: c.categories,
    budget_min: c.budget_min,
    budget_max: c.budget_max,
    zones: c.zones,
    nb_pieces_min: c.nb_pieces_min,
    meuble: c.meuble,
    description_libre: c.description_libre,
    statut: "active",
    created_by: user.id,
  }

  let { data: created, error } = await admin.from("search_requests").insert(row as never).select("id").single()
  // 42703 : colonne created_by absente (migration 042 non appliquée) → réessai sans.
  if (error?.code === "42703") {
    const { created_by: _cb, ...base } = row
    const retry = await admin.from("search_requests").insert(base as never).select("id").single()
    created = retry.data; error = retry.error
  }
  if (error || !created) {
    console.error("INAYA-SR-CREATE", error)
    return { ok: false, error: "Échec de la création de la recherche." }
  }

  // Matching immédiat : notifie le client (et, via notifySearcher, le créateur) des
  // biens DÉJÀ en ligne qui correspondent. Best-effort — n'échoue jamais la création.
  let matched = 0
  try { matched = (await runMatchingForRequest((created as { id: string }).id, { notify: true })).length } catch (e) { console.error("INAYA-SR-MATCH", e) }

  revalidatePath("/admin/recherches")
  return { ok: true, matched }
}

/** Modifie les critères d'une recherche. */
export async function updateSearchRequest(id: string, input: SearchInput): Promise<Res> {
  const { user, role } = await requireStaff()
  if (!user || !role || !STAFF.includes(role)) return { ok: false, error: "Action réservée au staff." }

  const c = cleanInput(input)
  const admin = createAdminClient()
  const { error } = await admin.from("search_requests").update({
    contact_telephone: c.contact_telephone || undefined,
    contact_nom: c.contact_nom,
    type_offre: c.type_offre,
    categories: c.categories,
    budget_min: c.budget_min,
    budget_max: c.budget_max,
    zones: c.zones,
    nb_pieces_min: c.nb_pieces_min,
    meuble: c.meuble,
    description_libre: c.description_libre,
  } as never).eq("id", id)
  if (error) { console.error("INAYA-SR-UPDATE", error); return { ok: false, error: "Échec de la mise à jour." } }
  revalidatePath("/admin/recherches")
  return { ok: true }
}

/** Change le statut (active / satisfaite / expiree). */
export async function setSearchStatus(id: string, statut: RequestStatus): Promise<Res> {
  if (!STATUSES.includes(statut)) return { ok: false, error: "Statut invalide." }
  const { user, role } = await requireStaff()
  if (!user || !role || !STAFF.includes(role)) return { ok: false, error: "Action réservée au staff." }
  const admin = createAdminClient()
  const { error } = await admin.from("search_requests").update({ statut } as never).eq("id", id)
  if (error) { console.error("INAYA-SR-STATUS", error); return { ok: false, error: "Échec du changement de statut." } }
  revalidatePath("/admin/recherches")
  return { ok: true }
}

/** Supprime définitivement une recherche. */
export async function deleteSearchRequest(id: string): Promise<Res> {
  const { user, role } = await requireStaff()
  if (!user || !role || !["super_admin", "admin", "moderateur"].includes(role)) return { ok: false, error: "Action réservée à l'administration." }
  const admin = createAdminClient()
  // Détache les matches liés (best-effort) avant suppression.
  await admin.from("matches").delete().eq("search_request_id", id).then(() => {}, () => {})
  const { error } = await admin.from("search_requests").delete().eq("id", id)
  if (error) { console.error("INAYA-SR-DELETE", error); return { ok: false, error: "Échec de la suppression." } }
  revalidatePath("/admin/recherches")
  return { ok: true }
}
