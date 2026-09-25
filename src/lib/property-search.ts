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

import { chambresDeduites } from "@/lib/pieces"
import { createAdminClient } from "@/lib/supabase/server"
import { lireTout } from "@/lib/lecture-complete"
import { estSousTypeTexte, correspondSousType } from "@/lib/sous-types"

export type SearchArgs = {
  type_offre?: string
  categorie?: string
  categories?: string[]
  commune?: string
  /** Plusieurs communes à la fois (le web et l'app le permettent désormais). */
  communes?: string[]
  quartier?: string          // peut contenir plusieurs quartiers (« Nimbo, Air France »)
  quartiers?: string[]
  prix_min?: number
  prix_max?: number
  chambres_min?: number
  mots_cles?: string
  tri?: "recent" | "prix_asc" | "prix_desc"
  /** Filtres explicites de l'app : catégorie/quartier/budget deviennent DURS
   *  (exclusion) au lieu de simples pénalités. L'assistant reste tolérant. */
  strict?: boolean
}

/** Univers d'une catégorie : on ne mélange pas résidentiel / commercial / terrain. */
function categoryUniverse(cat: string): "residentiel" | "commercial" | "terrain" | "autre" {
  if (cat === "terrain") return "terrain"
  if (cat === "local_commercial" || cat === "bureau" || cat === "magasin") return "commercial"
  if (cat === "maison" || cat === "appartement" || cat === "studio") return "residentiel"
  return "autre"
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

/**
 * Les seules colonnes que ce moteur et ses trois consommateurs (application
 * mobile, assistant du site, assistant WhatsApp) lisent réellement.
 *
 * À garder aligné sur `RawProperty` : toute colonne ajoutée ici sans y être
 * déclarée voyage sur le réseau pour rien, et c'est exactement ce qui a coûté
 * la plateforme — voir le commentaire dans `searchProperties`.
 */
const COLONNES_RECHERCHE = [
  "id", "reference", "titre", "description", "type_offre", "categorie",
  "prix", "prix_m2", "surface", "nb_pieces", "nb_chambres",
  "quartier", "ville", "meuble", "tarif_periode", "created_at",
].join(",")

// ── Mémoire courte du catalogue ─────────────────────────────────────────────
// Le catalogue change lentement (quelques centaines d'annonces par jour) alors
// que les recherches, elles, arrivent en rafale. Une minute de mémoire suffit à
// ce qu'une rafale ne coûte qu'une lecture.
//
// `enCours` est aussi important que `lignes` : sans lui, dix recherches
// simultanées sur un cache froid déclenchent dix lectures complètes en
// parallèle — précisément le pic qui fait sauter un quota.
const TTL_CATALOGUE_MS = 60_000
const catalogue = new Map<string, {
  lignes?: RawProperty[]
  expire?: number
  enCours?: Promise<RawProperty[]>
}>()

async function lireCatalogue(
  clef: string,
  charger: () => Promise<RawProperty[]>,
): Promise<RawProperty[]> {
  const e = catalogue.get(clef)
  if (e?.lignes && e.expire && Date.now() < e.expire) return e.lignes
  if (e?.enCours) return e.enCours

  const enCours = charger()
    .then(lignes => {
      catalogue.set(clef, { lignes, expire: Date.now() + TTL_CATALOGUE_MS })
      return lignes
    })
    .catch(err => {
      // Un échec ne doit jamais rester collé dans le cache : sinon toutes les
      // recherches suivantes échouent pendant une minute pour une panne d'une
      // seconde.
      catalogue.delete(clef)
      throw err
    })

  catalogue.set(clef, { ...e, enCours })
  return enCours
}

/** Vide la mémoire courte (à appeler après publication/modification d'annonce). */
export function invaliderCatalogue(): void { catalogue.clear() }

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
 * Nombre de chambres déduit d'une annonce, même si la colonne est vide.
 * La règle vit dans `lib/pieces.ts`, partagée avec le filtre de la page
 * `/biens` : deux copies avaient fini par diverger.
 */
export function bedroomsOf(p: RawProperty): number | null {
  return chambresDeduites(p)
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
  //
  // Ce pré-filtre s'arrêtait aux 600 annonces les plus récentes. Comme TOUT le
  // reste (commune, quartier, catégorie, mots-clés) est jugé en mémoire, ces
  // 600 lignes étaient l'univers entier de la recherche : sur 5 229 annonces
  // publiées, neuf sur dix étaient introuvables — pour l'application mobile
  // comme pour les deux assistants, qui partagent ce moteur.
  //
  // On lit donc tout, en demandant le décompte exact pour réclamer les pages
  // suivantes EN PARALLÈLE : deux allers-retours au lieu de six.
  //
  // MAIS on ne lit que les COLONNES UTILES. `select("*")` embarquait
  // `search_vector` — l'index full-text généré par Postgres à partir du titre,
  // de la description, du quartier et de la ville. Il pèse plusieurs fois le
  // texte d'origine, ne sert QU'à l'index côté SQL, et aucune ligne de ce
  // fichier ne le lit. Il partait pourtant sur le réseau pour chaque annonce, à
  // chaque recherche : c'est ce qui a fait exploser le quota de trafic Supabase
  // le 09/09/2026 et coupé la plateforme entière.
  const construire = () => {
    let q = admin.from("properties")
      .select(COLONNES_RECHERCHE, { count: "exact" })
      .eq("statut", "publie")
    if (wantResidence) q = q.eq("type_offre", "residence_meublee")
    else if (args.type_offre) q = q.eq("type_offre", args.type_offre)
    else q = q.neq("type_offre", "residence_meublee")
    // Tri TOTAL : `created_at` seul laisse deux annonces de la même seconde
    // changer de place d'une page à l'autre, donc apparaître deux fois ou
    // disparaître. `id` tranche.
    return q.order("created_at", { ascending: false }).order("id", { ascending: false })
  }

  // Cette lecture est identique pour toutes les recherches d'un même univers :
  // le tri fin (commune, catégorie, mots-clés) se fait ensuite en mémoire. La
  // relire à chaque requête revenait à retélécharger le catalogue entier pour
  // chaque visiteur. On la garde donc brièvement en mémoire du serveur.
  const clefUnivers = wantResidence ? "residence" : (args.type_offre ?? "hors-residence")
  const rows = await lireCatalogue(clefUnivers, async () => {
    const { lignes, error } = await lireTout<RawProperty>(construire)
    if (error) throw new Error((error as { message?: string }).message ?? "lecture des annonces")
    return lignes
  })

  const cats = args.categories?.length ? args.categories : (args.categorie ? [args.categorie] : [])
  const zones = splitZones(args).map(stripAccents).filter(Boolean)
  const kwRaw = args.mots_cles?.trim() ?? ""
  const kw = kwRaw ? stripAccents(kwRaw) : ""
  const isEntreeCouchee = !!kwRaw && ENTREE_COUCHEE_RE.test(kwRaw)

  // Une ou PLUSIEURS communes : chercher dans deux quartiers voisins séparés
  // par une limite communale est un besoin courant, et obliger à relancer la
  // recherche commune par commune revenait à cacher la moitié du marché.
  const communesVoulues = [
    ...(args.communes ?? []),
    ...(args.commune ? [args.commune] : []),
  ].map(c => stripAccents(c.trim())).filter(Boolean)

  const scored: ScoredProperty[] = []
  for (const p of rows) {
    let score = 1
    let soft = 0

    // ── Commune (ville) ── filtre STRICT quand une commune est demandée ────────
    // Sélectionner « Yamoussoukro » ne doit JAMAIS renvoyer des biens de Bouaké.
    if (communesVoulues.length) {
      const pVille = stripAccents(p.ville ?? "")
      const dansUne = communesVoulues.some(voulue => {
        if (pVille) {
          // Ville renseignée : elle doit correspondre à l'une des communes.
          return pVille === voulue || pVille.includes(voulue) || voulue.includes(pVille)
        }
        // Ville inconnue : on n'accepte que si la commune apparaît dans le texte.
        const hay = stripAccents(`${p.quartier ?? ""} ${p.titre} ${p.description ?? ""}`)
        return hay.includes(voulue)
      })
      if (!dansUne) continue
    }

    // ── Catégorie ────────────────────────────────────────────────────────────
    // Univers différent (une maison n'est pas un magasin ni un terrain) → hors
    // sujet : exclu en mode strict, sinon forte pénalité. Même univers, catégorie
    // voisine (maison ↔ appartement ↔ studio) → toléré (similaire).
    // Sous-types reconnus au TITRE (« conteneur ») : l'annonce correspond si le
    // texte le dit, quelle que soit sa colonne (autre / magasin / local).
    const sousTypes = cats.filter(estSousTypeTexte)
    const parTexte = sousTypes.some(c => correspondSousType(c, p))
    if (cats.length && !cats.includes(p.categorie) && !parTexte) {
      // Seuls des sous-types demandés et aucun ne correspond : l'univers « autre »
      // (fourre-tout) ne doit pas faire passer n'importe quel bien pour un conteneur.
      if (args.strict && sousTypes.length === cats.length) continue
      const wantedUniverses = new Set(cats.map(categoryUniverse))
      const sameUniverse = wantedUniverses.has(categoryUniverse(p.categorie))
      if (!sameUniverse) {
        if (args.strict) continue
        score -= 0.7
      } else {
        score -= 0.2; soft++
      }
    }

    // ── Budget ───────────────────────────────────────────────────────────────
    if (typeof args.prix_max === "number" && p.prix != null && p.prix > 0) {
      if (p.prix <= args.prix_max) { /* ok */ }
      else if (args.strict) continue                                   // budget explicite = plafond dur
      else if (p.prix <= args.prix_max * 1.2) { score -= 0.2; soft++ }
      else if (p.prix <= args.prix_max * 1.5) { score -= 0.45; soft++ }
      else continue // au-delà de +50 % : hors budget
    }
    if (typeof args.prix_min === "number" && p.prix != null && p.prix > 0 && p.prix < args.prix_min) { score -= 0.1; soft++ }

    // ── Quartier(s) ── cherchés sur quartier + titre + description ─────────────
    if (zones.length) {
      const hay = stripAccents(`${p.quartier ?? ""} ${p.titre} ${p.description ?? ""}`)
      const hit = zones.some(z => hay.includes(z))
      if (!hit) {
        if (args.strict) continue          // quartiers explicites = filtre dur
        score -= 0.35; soft++
      }
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
