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

// Durées INDÉPENDANTES par famille d'opération : les recherches en LOCATION
// tournent vite (le marché locatif bouge), celles en VENTE (maisons, terrains…)
// restent pertinentes plus longtemps. Réglées séparément par l'admin.
export const ALERTE_TTL_LOCATION_KEY = "alerte_pro_ttl_location_jours"
export const ALERTE_TTL_VENTE_KEY = "alerte_pro_ttl_vente_jours"
/** Ancienne clé unique (avant séparation location/vente) — sert de repli. */
export const ALERTE_TTL_LEGACY_KEY = "alerte_pro_ttl_jours"
export const ALERTE_TTL_DEFAULT_JOURS = 30

export interface AlerteProTtl { location: number; vente: number }

const toJours = (raw: unknown): number | null => {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

/** TTL (jours) par famille, configurés par l'admin. 0 = pas d'expiration. */
export async function getAlerteProTtl(): Promise<AlerteProTtl> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("key,value")
      .in("key", [ALERTE_TTL_LOCATION_KEY, ALERTE_TTL_VENTE_KEY, ALERTE_TTL_LEGACY_KEY])
    const byKey = new Map(((data ?? []) as { key: string; value: unknown }[]).map(r => [r.key, r.value]))
    const legacy = toJours(byKey.get(ALERTE_TTL_LEGACY_KEY))
    return {
      location: toJours(byKey.get(ALERTE_TTL_LOCATION_KEY)) ?? legacy ?? ALERTE_TTL_DEFAULT_JOURS,
      vente: toJours(byKey.get(ALERTE_TTL_VENTE_KEY)) ?? legacy ?? ALERTE_TTL_DEFAULT_JOURS,
    }
  } catch {
    return { location: ALERTE_TTL_DEFAULT_JOURS, vente: ALERTE_TTL_DEFAULT_JOURS }
  }
}

/** Famille d'une recherche : location (loyers, résidences meublées) ou vente (ventes, cessions). */
function ttlForType(ttl: AlerteProTtl, typeOffre: string | null | undefined): number {
  if (typeOffre === "location" || typeOffre === "residence_meublee") return ttl.location
  if (typeOffre === "vente" || typeOffre === "cession") return ttl.vente
  // Recherche « tous types » : on prend la durée la plus LONGUE (jamais expirer
  // trop tôt) ; 0 sur l'une des deux = jamais → prime.
  if (ttl.location <= 0 || ttl.vente <= 0) return 0
  return Math.max(ttl.location, ttl.vente)
}

/**
 * Date d'expiration à poser À LA CRÉATION d'une recherche, selon QUI cherche et
 * QUOI : NULL (permanente) pour un client final ou un anonyme ; création + TTL
 * (location ou vente selon le type recherché) pour un profil professionnel.
 * `searcherUserId` = le compte du CHERCHEUR (pas le staff qui saisit pour un client).
 */
export async function computeAlerteExpiry(
  searcherUserId: string | null | undefined,
  typeOffre?: string | null,
): Promise<string | null> {
  if (!searcherUserId) return null // anonyme = client final → permanente
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("profiles").select("role").eq("id", searcherUserId).maybeSingle()
    const role = (data as { role: string } | null)?.role ?? "client"
    if (!PRO_ROLES.has(role)) return null // client final → permanente
    const jours = ttlForType(await getAlerteProTtl(), typeOffre)
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
