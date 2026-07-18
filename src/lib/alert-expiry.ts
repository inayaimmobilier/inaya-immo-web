// ============================================================================
// Durée de vie des alertes/recherches (politique DG 2026-07-18) :
//   - CLIENT FINAL (chercheur réel, anonyme ou compte "client") → PERMANENTE
//     (expire_at NULL) jusqu'à désactivation par lui-même ou par l'admin.
//   - PROFESSIONNEL (agent interne/externe, apporteur, propriétaire,
//     prestataire, staff…) → expire_at = maintenant + TTL. Le TTL (jours) est
//     réglé par l'admin (app_settings.alerte_pro_ttl_jours, défaut 30 ; 0 = pas
//     d'expiration).
// Les alertes expirées ne sont plus matchées ni notifiées (voir isSearchExpired,
// appliqué par le moteur de matching), et s'affichent « Expirée » dans l'admin.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"

/** Rôles considérés comme PROFESSIONNELS (alerte à durée de vie limitée). */
const PRO_ROLES = new Set([
  "super_admin", "admin", "moderateur", "agent", "comptable",
  "apporteur", "proprietaire", "prestataire",
])

export const ALERTE_TTL_SETTING_KEY = "alerte_pro_ttl_jours"
export const ALERTE_TTL_DEFAULT_JOURS = 30

/** TTL (jours) configuré par l'admin. 0 = pas d'expiration automatique. */
export async function getAlerteProTtlJours(): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("value").eq("key", ALERTE_TTL_SETTING_KEY).maybeSingle()
    const raw = (data as { value: unknown } | null)?.value
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
    return ALERTE_TTL_DEFAULT_JOURS
  } catch {
    return ALERTE_TTL_DEFAULT_JOURS
  }
}

/**
 * Date d'expiration à poser À LA CRÉATION d'une recherche, selon QUI cherche :
 * NULL (permanente) pour un client final ou un anonyme ; création + TTL pour un
 * profil professionnel. `searcherUserId` = le compte du CHERCHEUR (pas le staff
 * qui saisit pour un client).
 */
export async function computeAlerteExpiry(searcherUserId: string | null | undefined): Promise<string | null> {
  if (!searcherUserId) return null // anonyme = client final → permanente
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("profiles").select("role").eq("id", searcherUserId).maybeSingle()
    const role = (data as { role: string } | null)?.role ?? "client"
    if (!PRO_ROLES.has(role)) return null // client final → permanente
    const jours = await getAlerteProTtlJours()
    if (jours <= 0) return null // 0 = l'admin a désactivé l'expiration
    return new Date(Date.now() + jours * 24 * 3_600_000).toISOString()
  } catch {
    return null
  }
}

/** Une recherche est-elle expirée ? (tolère l'absence de la colonne : jamais expirée) */
export function isSearchExpired(r: { expire_at?: string | null }): boolean {
  return !!r.expire_at && new Date(r.expire_at).getTime() <= Date.now()
}
