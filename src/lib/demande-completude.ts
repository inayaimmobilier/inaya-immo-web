// ============================================================================
// COMPLÉTUDE D'UNE DEMANDE — les éléments clés sont-ils tous établis ?
//
// Règle posée par la direction : on n'alerte quelqu'un que si le bien répond
// vraiment à ce qu'il cherche. Cela suppose de SAVOIR ce qu'il cherche. Tant
// qu'un critère clé reste indéterminé, la demande est enregistrée mais
// n'envoie rien, jusqu'à vérification humaine.
//
// Ce qui rendait la règle indispensable, mesuré en production : « non
// renseigné » servait de laissez-passer. Une demande sans catégorie acceptait
// toutes les catégories ; sans quartier, tous les quartiers. Une personne
// réclamant « deux ou trois chambres salon » a reçu huit studios.
//
// Le module ne devine pas : il LIT le texte de la demande, et déclare
// honnêtement ce qu'il n'a pas pu établir.
// ============================================================================

import type { PropertyCat, PropertyType } from "@/types/database"
import { deduireCriteres } from "@/lib/demande-criteres"
import { extractRooms } from "@/lib/rooms-extract"

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/**
 * Catégories pour lesquelles le NOMBRE DE PIÈCES est un critère clé. Un terrain
 * ou un magasin n'en a pas : l'exiger bloquerait des demandes parfaitement
 * claires, ce qui ferait rejeter la règle au lieu de la respecter.
 */
const AVEC_PIECES = new Set<PropertyCat>(["maison", "appartement"])

/**
 * Budget écrit en toutes lettres du marché : « 60 000 », « 60000 », « 60k »,
 * « 60 mille », « 100.000 F », « 3 millions ». On capte le NOMBRE, pas la
 * devise — personne n'écrit « FCFA » de la même façon deux fois.
 */
export function extraireBudget(texte: string | null | undefined): number | null {
  const t = sansAccents((texte ?? "").replace(/ /g, " "))

  // Millions d'abord : « 3 millions » vaut 3 000 000, pas 3.
  const mMillion = t.match(/(\d+(?:[.,]\d+)?)\s*(?:millions?|m\b)/)
  if (mMillion) {
    const n = Number(mMillion[1].replace(",", "."))
    if (Number.isFinite(n) && n > 0 && n < 10_000) return Math.round(n * 1_000_000)
  }

  // « 60k », « 60 mille »
  const mMille = t.match(/(\d+(?:[.,]\d+)?)\s*(?:k\b|milles?\b)/)
  if (mMille) {
    const n = Number(mMille[1].replace(",", "."))
    if (Number.isFinite(n) && n > 0 && n < 100_000) return Math.round(n * 1_000)
  }

  // Nombre à séparateurs : « 100 000 », « 100.000 », « 100,000 ».
  // Au moins quatre chiffres une fois les séparateurs retirés : en dessous, on
  // capterait un nombre de pièces ou une année.
  for (const m of t.matchAll(/\b(\d{1,3}(?:[ .,]\d{3})+|\d{4,9})\b/g)) {
    const n = Number(m[1].replace(/[ .,]/g, ""))
    // Bornes du marché local : un loyer ou un prix hors de cette plage est
    // presque toujours un numéro de téléphone ou une superficie mal lue.
    if (Number.isFinite(n) && n >= 5_000 && n <= 5_000_000_000) return n
  }
  return null
}

/**
 * Repère une commune connue dans le texte. Le vocabulaire vient de la BASE
 * (villes réellement présentes) et non d'une liste figée : le parc évolue, et
 * une liste codée en dur vieillirait sans que personne ne s'en aperçoive.
 */
export function extraireCommune(texte: string | null | undefined, communes: string[]): string | null {
  const t = sansAccents(texte ?? "")
  // La plus longue d'abord : « Yamoussoukro » avant « Yamou » si les deux
  // existaient, sinon la plus courte gagnerait à tort.
  const triees = [...communes].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const c of triees) {
    if (t.includes(sansAccents(c))) return c
  }
  return null
}

export interface DemandeBrute {
  type_offre: PropertyType | null
  categories: PropertyCat[] | null
  commune?: string | null
  zones: string[] | null
  budget_min: number | null
  budget_max: number | null
  nb_pieces_min: number | null
  description_libre?: string | null
}

export interface Completude {
  /** Critères établis, colonnes complétées par ce qui a été lu dans le texte. */
  resolus: {
    type_offre: PropertyType | null
    categories: PropertyCat[] | null
    commune: string | null
    quartiers: string[]
    budget: number | null
    nb_pieces_min: number | null
  }
  /** Ce qui n'a PAS pu être établi. Vide = demande exploitable telle quelle. */
  manquants: string[]
  complete: boolean
}

/** Libellés destinés au modérateur : il doit lire ce qui manque, pas un code. */
export const LIBELLE_CRITERE: Record<string, string> = {
  type_offre: "Type d'annonce (location ou vente)",
  categorie: "Type de bien",
  commune: "Commune",
  quartier: "Quartier",
  budget: "Budget",
  nb_pieces: "Nombre de pièces",
}

/**
 * Établit les critères d'une demande et dit ce qui manque.
 *
 * `communes` : vocabulaire des communes connues, à passer depuis l'appelant
 * (lecture en base). Vide, la commune ne pourra être établie que si elle est
 * déjà en colonne — et la demande partira en validation, ce qui est le
 * comportement prudent attendu.
 */
export interface Vocabulaire {
  /** Communes réellement présentes en base. */
  communes: string[]
  /**
   * Quartier (sans accents, minuscules) → sa commune, UNIQUEMENT quand elle est
   * certaine. Les quartiers présents dans plusieurs communes en sont exclus :
   * mesuré sur le parc, 17 le sont — « Kami » compte 5 biens à Bouaké et 5 à
   * Yamoussoukro, « Kokrenou » existe dans les deux. Deviner la commune dans ce
   * cas produirait exactement l'erreur à éviter : proposer un bien de
   * Yamoussoukro à quelqu'un qui cherche à Bouaké.
   */
  communeParQuartier: Record<string, string>
  /** Quartiers ambigus, à faire trancher par un humain. */
  quartiersAmbigus: Set<string>
}

export function analyserDemande(
  d: DemandeBrute,
  vocab: Vocabulaire = { communes: [], communeParQuartier: {}, quartiersAmbigus: new Set() },
): Completude {
  const communes = vocab.communes
  const texte = d.description_libre ?? ""
  const deduits = deduireCriteres(texte)

  const type_offre = d.type_offre ?? deduits.typeOffre
  const categories = d.categories?.length ? d.categories : deduits.categories

  // La commune peut déjà être en colonne (saisie web/app), sinon être nommée
  // dans le texte ou dans les zones.
  const quartiersBruts = (d.zones ?? []).map(z => z.trim()).filter(Boolean)
  const communeDite = (d.commune?.trim() || null)
    ?? extraireCommune(texte, communes)
    ?? extraireCommune(quartiersBruts.join(" "), communes)

  // Commune DÉDUITE DU QUARTIER via la base, quand elle est certaine. C'est ce
  // que la direction demandait : « si le texte de l'utilisateur ET la base de
  // données ne permettent pas de définir clairement ». La base sait que
  // Kennedy est à Bouaké ; elle ne sait pas trancher pour Kami.
  const commune = communeDite ?? (() => {
    const ambigu = quartiersBruts.some(q => vocab.quartiersAmbigus.has(sansAccents(q)))
    if (ambigu) return null
    const trouvees = new Set(
      quartiersBruts.map(q => vocab.communeParQuartier[sansAccents(q)]).filter(Boolean),
    )
    return trouvees.size === 1 ? [...trouvees][0] : null
  })()

  const quartiers = quartiersBruts.filter(
    z => !commune || sansAccents(z) !== sansAccents(commune),
  )

  const budget = d.budget_max ?? d.budget_min ?? extraireBudget(texte)

  // Le nombre de pièces vient de `rooms-extract`, le même code qui l'extrait des
  // ANNONCES : une demande et une offre doivent être lues avec la même règle,
  // sinon « 2 chambres salon » ne voudrait pas dire la même chose des deux côtés.
  const categoriePrincipale = categories?.[0] ?? "autre"
  const pieces = extractRooms(texte, categoriePrincipale)
  const nb_pieces_min = d.nb_pieces_min
    ?? pieces.nb_pieces
    // « 2 chambres » = 2 chambres + 1 salon dans l'usage local.
    ?? (pieces.nb_chambres != null ? pieces.nb_chambres + 1 : null)

  const manquants: string[] = []
  if (!type_offre) manquants.push("type_offre")
  if (!categories || categories.length === 0) manquants.push("categorie")
  if (!commune) manquants.push("commune")
  if (quartiers.length === 0) manquants.push("quartier")
  if (budget == null) manquants.push("budget")
  if (categories?.some(c => AVEC_PIECES.has(c)) && nb_pieces_min == null) {
    manquants.push("nb_pieces")
  }

  return {
    resolus: { type_offre, categories, commune, quartiers, budget, nb_pieces_min },
    manquants,
    complete: manquants.length === 0,
  }
}
