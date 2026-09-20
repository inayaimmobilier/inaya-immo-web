// ============================================================================
// GARDE-BARRIÈRE DE L'APPLICATION D'ADMINISTRATION.
//
// L'application « Inaya Admin » ne parle jamais à Supabase en direct : elle
// passe par /api/admin/mobile/*, qui vérifie le jeton porteur puis le RÔLE.
// C'est la même règle que le back-office web, écrite une seule fois — deux
// tables de permissions finiraient par diverger, et c'est côté mobile que le
// téléphone se perd ou se prête.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

export type RoleStaff = "super_admin" | "admin" | "moderateur" | "agent"

const ROLES_STAFF: RoleStaff[] = ["super_admin", "admin", "moderateur", "agent"]

export interface Staff {
  userId: string
  role: RoleStaff
  nom: string | null
}

/**
 * Identifie le membre du staff derrière une requête, ou `null` si le jeton est
 * absent, invalide, ou si le compte n'est pas du staff.
 */
export async function staffDepuisEntete(header: string | null): Promise<Staff | null> {
  const userId = userIdFromAuthHeader(header)
  if (!userId) return null
  const { data } = await createAdminClient()
    .from("profiles").select("id,nom,role").eq("id", userId).maybeSingle()
  const p = data as { id: string; nom: string | null; role: string | null } | null
  if (!p?.role || !ROLES_STAFF.includes(p.role as RoleStaff)) return null
  return { userId: p.id, role: p.role as RoleStaff, nom: p.nom }
}

/**
 * Ce que chaque rôle a le droit de faire. Repris à l'identique du back-office :
 *  - modérer  : valider, rejeter, suspendre une annonce ;
 *  - supprimer: réservé aux administrateurs (action irréversible) ;
 *  - numeros  : voir le numéro du propriétaire — refusé aux agents et
 *               modérateurs, pour qu'ils ne contactent pas le propriétaire en
 *               direct et ne court-circuitent pas la commission d'Inaya.
 */
export const DROITS = {
  moderer: ["super_admin", "admin", "moderateur"] as RoleStaff[],
  supprimer: ["super_admin", "admin"] as RoleStaff[],
  numeros: ["super_admin", "admin"] as RoleStaff[],
  parametres: ["super_admin", "admin"] as RoleStaff[],
}

export function peut(role: RoleStaff, droit: keyof typeof DROITS): boolean {
  return DROITS[droit].includes(role)
}

/**
 * Masque les numéros de téléphone d'un texte libre.
 *
 * Le message d'origine d'une annonce contient presque toujours le numéro de
 * l'annonceur : l'afficher tel quel à un agent annulerait la règle ci-dessus.
 */
export function masquerNumeros(texte: string): string {
  return texte.replace(/(?:\+?\d[\d\s.-]{6,}\d)/g, m =>
    (m.replace(/\D/g, "").length >= 8 ? "•••• (réservé admin)" : m))
}

/** Réponse d'erreur normalisée — l'app distingue 401 (reconnexion) et 403. */
export function refus(raison: "non_authentifie" | "acces_refuse"): Response {
  return Response.json({ error: raison }, { status: raison === "non_authentifie" ? 401 : 403 })
}
