// ============================================================================
// Moteur d'EXPIRATION des annonces. Les règles (table expiry_rules, réglées par
// l'admin) donnent une durée de vie en jours selon des critères. Ce module :
//   1) calcule expire_at d'une annonce (1re règle qui matche, par priorité) ;
//   2) balaie les annonces publiées et passe en statut « expire » celles dont la
//      durée de vie est dépassée (déclenché par cron + bouton admin).
// Sans règle qui matche → pas d'expiration (expire_at reste NULL).
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

export interface ExpiryRule {
  id: string; nom: string; actif: boolean; priorite: number
  type_offre: string | null; categorie: string | null; ville: string | null
  quartiers: string[] | null; prix_min: number | null; prix_max: number | null
  meuble: boolean | null; duree_jours: number
}

interface PropForExpiry {
  id: string; type_offre: string; categorie: string; ville: string | null; quartier: string | null
  prix: number | null; meuble: boolean | null
  created_at: string; validated_at: string | null; expire_at: string | null
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()

/** La 1re règle active (par priorité décroissante) dont TOUS les critères matchent. */
export function matchRule(p: PropForExpiry, rules: ExpiryRule[]): ExpiryRule | null {
  for (const r of rules) {
    if (r.type_offre && r.type_offre !== p.type_offre) continue
    if (r.categorie && r.categorie !== p.categorie) continue
    if (r.ville && norm(r.ville) !== norm(p.ville) && !norm(p.ville).includes(norm(r.ville))) continue
    if (r.quartiers && r.quartiers.length) {
      const pq = norm(p.quartier)
      if (!r.quartiers.some(q => norm(q) === pq || pq.includes(norm(q)))) continue
    }
    if (r.prix_min != null && (p.prix ?? 0) < r.prix_min) continue
    if (r.prix_max != null && (p.prix ?? Number.POSITIVE_INFINITY) > r.prix_max) continue
    if (r.meuble != null && r.meuble !== !!p.meuble) continue
    return r
  }
  return null
}

/** expire_at calculé = date de publication (validated_at, sinon created_at) + durée. */
export function computeExpireAt(p: PropForExpiry, rules: ExpiryRule[]): string | null {
  const rule = matchRule(p, rules)
  if (!rule) return null
  const base = new Date(p.validated_at ?? p.created_at)
  if (isNaN(base.getTime())) return null
  return new Date(base.getTime() + rule.duree_jours * 86_400_000).toISOString()
}

/**
 * Balaie les annonces publiées : (a) renseigne expire_at manquant depuis les
 * règles, (b) passe en « expire » celles dont la durée de vie est dépassée.
 */
export async function runExpirySweep(): Promise<{ ok: boolean; expired: number; backfilled: number; rules: number; error?: string }> {
  const admin = createAdminClient()

  let rules: ExpiryRule[]
  try {
    const { data, error } = await admin.from("expiry_rules")
      .select("id, nom, actif, priorite, type_offre, categorie, ville, quartiers, prix_min, prix_max, meuble, duree_jours")
      .eq("actif", true).order("priorite", { ascending: false })
    if (error) throw error
    rules = (data ?? []) as ExpiryRule[]
  } catch (e) {
    return { ok: false, expired: 0, backfilled: 0, rules: 0, error: `Règles d'expiration indisponibles (migration 033 ?) : ${(e as Error).message}` }
  }
  if (rules.length === 0) return { ok: true, expired: 0, backfilled: 0, rules: 0 }

  const { data: rows, error: qErr } = await admin.from("properties")
    .select("id, type_offre, categorie, ville, quartier, prix, meuble, created_at, validated_at, expire_at")
    .eq("statut", "publie").limit(5000)
  if (qErr) return { ok: false, expired: 0, backfilled: 0, rules: rules.length, error: qErr.message }

  const now = Date.now()
  const toExpire: string[] = []
  const toBackfill: { id: string; expire_at: string }[] = []

  for (const p of (rows ?? []) as PropForExpiry[]) {
    const eat = p.expire_at ?? computeExpireAt(p, rules)
    if (!eat) continue
    if (!p.expire_at) toBackfill.push({ id: p.id, expire_at: eat })
    if (new Date(eat).getTime() < now) toExpire.push(p.id)
  }

  // Backfill des expire_at manquants (par lots).
  for (let i = 0; i < toBackfill.length; i += 200) {
    const chunk = toBackfill.slice(i, i + 200)
    await Promise.all(chunk.map(b =>
      admin.from("properties").update({ expire_at: b.expire_at } as never).eq("id", b.id).then(() => {}, () => {}),
    ))
  }

  // Passage en « expire » (par lots).
  let expired = 0
  for (let i = 0; i < toExpire.length; i += 200) {
    const chunk = toExpire.slice(i, i + 200)
    const { error } = await admin.from("properties").update({ statut: "expire" } as never).in("id", chunk)
    if (!error) expired += chunk.length
    else console.error("INAYA-EXPIRE-SWEEP", error.message)
  }

  return { ok: true, expired, backfilled: toBackfill.length, rules: rules.length }
}

/** expire_at d'une annonce précise (à la publication). Best-effort. */
export async function expireAtForProperty(propertyId: string): Promise<string | null> {
  const admin = createAdminClient()
  try {
    const { data: rulesData } = await admin.from("expiry_rules")
      .select("id, nom, actif, priorite, type_offre, categorie, ville, quartiers, prix_min, prix_max, meuble, duree_jours")
      .eq("actif", true).order("priorite", { ascending: false })
    const rules = (rulesData ?? []) as ExpiryRule[]
    if (rules.length === 0) return null
    const { data } = await admin.from("properties")
      .select("id, type_offre, categorie, ville, quartier, prix, meuble, created_at, validated_at, expire_at")
      .eq("id", propertyId).maybeSingle()
    if (!data) return null
    return computeExpireAt(data as PropForExpiry, rules)
  } catch { return null }
}
