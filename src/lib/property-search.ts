// ============================================================================
// Moteur de recherche PARTAGÉ des assistants (web + WhatsApp/Maryama).
//
// POURQUOI : les assistants filtraient en SQL DUR (gte("nb_chambres", n),
// lte("prix", max), un seul quartier). Or, en Postgres, « NULL >= 2 » est FAUX :
// toute annonce dont `nb_chambres` n'est pas renseigné (la majorité des annonces
// ingérées de WhatsApp, où « 2 chambres salon » est dans le TITRE mais pas dans
// la colonne) était EXCLUE. Résultat : des biens pourtant présents en base
// n'étaient jamais retrouvés, alors même que le moteur d'alerte (scoring en
// mémoire) les trouvait. Symptôme rapporté : « je n'ai pas d'annonce exacte »
// juste après avoir listé ces mêmes biens dans une alerte.
//
// PRINCIPE : pré-filtre LARGE (statut + type_offre) puis SCORING en mémoire,
// tolérant aux colonnes nulles. On renvoie les correspondances EXACTES et
// SIMILAIRES, triées par pertinence, pour ne JAMAIS répondre « rien » quand des
// biens proches existent. Le nombre de chambres est déduit du titre/description à
// défaut de colonne ; les quartiers peuvent être multiples ; le budget et la
// catégorie tolèrent un écart (marqué « similaire »).
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"

export type SearchArgs = {
  type_offre?: string
  categorie?: string
  categories?: string[]
  commune?: string
  quartier?: string          // peut contenir plusieurs quartiers (« Nimbo, Air France »)
  quartiers?: string[]
  prix_min?: number
  prix_max?: number
  chambres_min?: number
  mots_cles?: string
  tri?: "recent" | "prix_asc" | "prix_desc"
}

export type RawProperty = {
  id: string; reference: number | null; titre: string; description: string | null
  type_offre: string; categorie: string; prix: number | null; prix_m2: number | null
  surface: number | null; nb_pieces: number | null; nb_chambres: number | null
  quartier: string | null; ville: string | null; meuble: boolean | null; tarif_periode: string | null
  created_at?: string | null
}

export type ScoredProperty = RawProperty & {
  /** « exacte » = tous les critères respectés ; « similaire » = proche (écart toléré). */
  correspondance: "exacte" | "similaire"
  score: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
const dateMs = (p: RawProperty) => (p.created_at ? new Date(p.created_at).getTime() : 0)

// « Entrée couchée » : logement d'UNE pièce, sanitaires communs. S'écrit de mille
// façons (« entré couché », « entrer coucher », « entrée-couchée »…) : on détecte
// le radical « entr…couch ».
const ENTREE_COUCHEE_RE = /entr[a-z]*[\s-]*couch/i

/** Éclate un champ quartier libre en plusieurs quartiers (« Nimbo, Air France et Koko »). */
function splitZones(args: SearchArgs): string[] {
  const raw = [...(args.quartiers ?? []), ...(args.quartier ? [args.quartier] : [])]
  return raw
    .flatMap(s => s.split(/[,/;\n]|\bet\b|\bou\b/i))
    .map(s => s.replace(/[()]/g, " ").trim())
    .filter(Boolean)
}

/**
 * Nombre de chambres déduit d'une annonce, même si la colonne est vide :
 *  - colonne nb_chambres si présente ;
 *  - sinon « X chambres » / « X pièces » dans le titre ou la description
 *    (X pièces = X-1 chambres, le salon comptant comme une pièce) ;
 *  - « chambre salon » sans chiffre = 1 chambre ;
 *  - sinon nb_pieces - 1 ; sinon indéterminé (null).
 */
export function bedroomsOf(p: RawProperty): number | null {
  if (typeof p.nb_chambres === "number") return p.nb_chambres
  const hay = stripAccents(`${p.titre} ${p.description ?? ""}`)
  const m = hay.match(/(\d+)\s*(chambres?|pieces?|pces?)/)
  if (m) {
    const n = Number(m[1])
    return /piece|pce/.test(m[2]) ? Math.max(0, n - 1) : n
  }
  if (/chambre\s*salon|chbre\s*salon|\bch\s*salon/.test(hay)) return 1
  if (typeof p.nb_pieces === "number") return Math.max(0, p.nb_pieces - 1)
  return null
}

/**
 * Recherche tolérante. Renvoie les biens correspondants et SIMILAIRES, triés par
 * pertinence (puis récence), chacun marqué « exacte » ou « similaire ».
 */
export async function searchProperties(args: SearchArgs, opts: { limit?: number } = {}): Promise<ScoredProperty[]> {
  const admin = createAdminClient()
  const wantResidence = args.type_offre === "residence_meublee"

  // Pré-filtre LARGE : uniquement statut + univers (type_offre). Tout le reste est
  // marqué en mémoire pour ne jamais exclure une annonce à colonne nulle.
  let q = admin.from("properties").select("*").eq("statut", "publie").limit(600)
  if (wantResidence) q = q.eq("type_offre", "residence_meublee")
  else if (args.type_offre) q = q.eq("type_offre", args.type_offre)
  else q = q.neq("type_offre", "residence_meublee")
  q = q.order("created_at", { ascending: false })

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as RawProperty[]

  const cats = args.categories?.length ? args.categories : (args.categorie ? [args.categorie] : [])
  const zones = splitZones(args).map(stripAccents).filter(Boolean)
  const kwRaw = args.mots_cles?.trim() ?? ""
  const kw = kwRaw ? stripAccents(kwRaw) : ""
  const isEntreeCouchee = !!kwRaw && ENTREE_COUCHEE_RE.test(kwRaw)

  const scored: ScoredProperty[] = []
  for (const p of rows) {
    let score = 1
    let soft = 0

    // ── Catégorie ────────────────────────────────────────────────────────────
    // Écart de catégorie toléré (similaire), SAUF terrain ↔ logement (franc).
    if (cats.length && !cats.includes(p.categorie)) {
      const wantTerrain = cats.includes("terrain")
      const isTerrain = p.categorie === "terrain"
      if (wantTerrain !== isTerrain) score -= 0.7 // hors sujet (terrain vs bâti)
      else { score -= 0.25; soft++ }
    }

    // ── Budget ───────────────────────────────────────────────────────────────
    if (typeof args.prix_max === "number" && p.prix != null && p.prix > 0) {
      if (p.prix <= args.prix_max) { /* ok */ }
      else if (p.prix <= args.prix_max * 1.2) { score -= 0.2; soft++ }
      else if (p.prix <= args.prix_max * 1.5) { score -= 0.45; soft++ }
      else continue // au-delà de +50 % : hors budget
    }
    if (typeof args.prix_min === "number" && p.prix != null && p.prix > 0 && p.prix < args.prix_min) { score -= 0.1; soft++ }

    // ── Quartier(s) ── cherchés sur quartier + titre + description ─────────────
    if (zones.length) {
      const hay = stripAccents(`${p.quartier ?? ""} ${p.titre} ${p.description ?? ""}`)
      const hit = zones.some(z => hay.includes(z))
      if (!hit) { score -= 0.25; soft++ }
    }

    // ── Chambres minimales ── déduites même sans colonne ──────────────────────
    if (typeof args.chambres_min === "number") {
      const b = bedroomsOf(p)
      if (b == null) score -= 0.05                       // indéterminé → quasi neutre
      else if (b < args.chambres_min) { score -= 0.2; soft++ }
    }

    // ── Mots-clés (ex. « entrée couchée », « ACD », « meublé ») ───────────────
    if (kw) {
      const hay = stripAccents(`${p.titre} ${p.description ?? ""}`)
      const hit = isEntreeCouchee ? ENTREE_COUCHEE_RE.test(hay) : hay.includes(kw)
      if (!hit) { score -= 0.4; soft++ }
    }

    if (score < 0.4) continue
    scored.push({ ...p, correspondance: soft === 0 ? "exacte" : "similaire", score: round2(score) })
  }

  // ── Tri ────────────────────────────────────────────────────────────────────
  if (args.tri === "prix_asc") {
    scored.sort((a, b) => (a.prix ?? Number.POSITIVE_INFINITY) - (b.prix ?? Number.POSITIVE_INFINITY) || b.score - a.score)
  } else if (args.tri === "prix_desc") {
    scored.sort((a, b) => (b.prix ?? 0) - (a.prix ?? 0) || b.score - a.score)
  } else {
    // Pertinence d'abord (exactes avant similaires), puis récence.
    scored.sort((a, b) => b.score - a.score || dateMs(b) - dateMs(a))
  }

  return scored.slice(0, opts.limit ?? 12)
}
