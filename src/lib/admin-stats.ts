// ============================================================================
// Statistiques ANNONCES du dashboard admin.
//   PostgREST n'offre pas de GROUP BY : on récupère une fenêtre bornée de lignes
//   et on agrège en mémoire (suffisant à cette échelle, et sans vue SQL à
//   maintenir). Toutes les fonctions sont tolérantes : une table absente
//   (migration non appliquée) renvoie un résultat vide plutôt qu'une erreur.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

const MAX_ROWS = 5000

export interface TopProperty {
  id: string; reference: number | null; titre: string
  statut: string; type_offre: string; prix: number | null
  ville: string | null; quartier: string | null; created_at: string
  vues: number
}
export interface SearchTerm { terme: string; count: number }
export interface DeletionPoint { jour: string; count: number }

const UUID_RE = /^\/biens\/([0-9a-f-]{36})/i

/** Annonces les plus consultées sur `jours` derniers jours (via page_views). */
export async function topViewedProperties(jours = 30, limit = 15): Promise<TopProperty[]> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - jours * 86_400_000).toISOString()
  try {
    const { data } = await admin.from("page_views")
      .select("path").gte("created_at", since).like("path", "/biens/%").limit(MAX_ROWS)
    const counts = new Map<string, number>()
    for (const v of (data ?? []) as { path: string }[]) {
      const m = UUID_RE.exec(v.path)
      if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
    }
    if (counts.size === 0) return []
    const ids = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
    const { data: props } = await admin.from("properties")
      .select("id,reference,titre,statut,type_offre,prix,ville,quartier,created_at").in("id", ids)
    return ((props ?? []) as Omit<TopProperty, "vues">[])
      .map(p => ({ ...p, vues: counts.get(p.id) ?? 0 }))
      .sort((a, b) => b.vues - a.vues)
  } catch { return [] }
}

/** Termes les plus recherchés (zones, type d'offre, catégories des recherches). */
export async function topSearchTerms(jours = 90, limit = 12): Promise<{
  zones: SearchTerm[]; types: SearchTerm[]; categories: SearchTerm[]; total: number
}> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - jours * 86_400_000).toISOString()
  try {
    const { data } = await admin.from("search_requests")
      .select("zones,type_offre,categories").gte("created_at", since).limit(MAX_ROWS)
    const rows = (data ?? []) as { zones: string[] | null; type_offre: string | null; categories: string[] | null }[]
    const tally = (vals: (string | null | undefined)[]) => {
      const m = new Map<string, number>()
      for (const v of vals) {
        const k = (v ?? "").trim()
        if (k) m.set(k, (m.get(k) ?? 0) + 1)
      }
      return [...m.entries()].map(([terme, count]) => ({ terme, count }))
        .sort((a, b) => b.count - a.count).slice(0, limit)
    }
    return {
      zones: tally(rows.flatMap(r => r.zones ?? [])),
      types: tally(rows.map(r => r.type_offre)),
      categories: tally(rows.flatMap(r => r.categories ?? [])),
      total: rows.length,
    }
  } catch { return { zones: [], types: [], categories: [], total: 0 } }
}

/** Répartition des annonces par statut (actives = publiées). */
export async function countsByStatut(): Promise<Record<string, number>> {
  const admin = createAdminClient()
  const statuts = ["publie", "en_attente_validation", "expire", "suspendu", "rejete", "reserve", "conclu"]
  const out: Record<string, number> = {}
  await Promise.all(statuts.map(async s => {
    try {
      const { count } = await admin.from("properties")
        .select("id", { count: "exact", head: true }).eq("statut", s)
      out[s] = count ?? 0
    } catch { out[s] = 0 }
  }))
  return out
}

/** Suppressions par jour sur une période (journal property_deletions). */
export async function deletionsOverTime(from: string, to: string): Promise<{
  points: DeletionPoint[]; total: number; disponible: boolean
}> {
  const admin = createAdminClient()
  try {
    const { data, error } = await admin.from("property_deletions")
      .select("deleted_at")
      .gte("deleted_at", `${from}T00:00:00`).lte("deleted_at", `${to}T23:59:59`)
      .limit(MAX_ROWS)
    if (error) return { points: [], total: 0, disponible: false }
    const m = new Map<string, number>()
    for (const d of (data ?? []) as { deleted_at: string }[]) {
      const jour = d.deleted_at.slice(0, 10)
      m.set(jour, (m.get(jour) ?? 0) + 1)
    }
    const points = [...m.entries()].map(([jour, count]) => ({ jour, count })).sort((a, b) => a.jour.localeCompare(b.jour))
    return { points, total: points.reduce((s, p) => s + p.count, 0), disponible: true }
  } catch { return { points: [], total: 0, disponible: false } }
}

/** Annonces publiées les plus anciennes (candidates au nettoyage). */
export async function oldestProperties(limit = 20): Promise<TopProperty[]> {
  const admin = createAdminClient()
  try {
    const { data } = await admin.from("properties")
      .select("id,reference,titre,statut,type_offre,prix,ville,quartier,created_at")
      .eq("statut", "publie").order("created_at", { ascending: true }).limit(limit)
    return ((data ?? []) as Omit<TopProperty, "vues">[]).map(p => ({ ...p, vues: 0 }))
  } catch { return [] }
}
