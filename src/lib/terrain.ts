// ============================================================================
// TERRAINS — surface et USAGE.
//
// « Terrain » recouvre deux marchés qui n'ont rien à voir : le lot à bâtir de
// 400 à 600 m² qu'on achète pour construire, et la parcelle agricole de
// plusieurs hectares. Mesuré sur le parc : 515 lots entre 300 et 700 m² contre
// 72 parcelles de plus d'un hectare. Les proposer dans la même liste, c'est
// obliger l'un et l'autre à faire défiler des annonces sans rapport.
//
// Le nombre de pièces n'a évidemment aucun sens ici : c'est la SURFACE et
// l'USAGE qui distinguent.
//
// Deux sources : la surface (renseignée sur 79 % des terrains) et le
// vocabulaire de l'annonce. Le vocabulaire l'emporte quand il est explicite —
// « terrain agricole de 1 hectare » est agricole même si un seuil de surface
// dirait autre chose ; c'est le vendeur qui sait ce qu'il vend.
// ============================================================================

export type UsageTerrain = "habitation" | "agricole" | "commercial" | "indetermine"

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/**
 * Vocabulaire relevé dans les annonces réelles, par fréquence décroissante.
 * « ACD » (350 occurrences) est volontairement ABSENT : c'est un document de
 * propriété, présent sur les deux familles, il ne distingue rien.
 */
const AGRICOLE = /\bagricoles?\b|\bplantations?\b|\bfermes?\b|\bcacao\b|\banacardes?\b|\bhevea\b|\bpalmiers?\b|\bcultures?\b|\bchamps?\b|\bvergers?\b/
const COMMERCIAL = /\bcommerciales?\b|\bcommercial\b|\bindustriels?\b|\bindustrielle\b|\bentrepots?\b|\busine\b|\bzone\s+industrielle\b/
const HABITATION = /\blotissements?\b|\bresidentiels?\b|\bresidentielle\b|\bhabitations?\b|\ba\s+batir\b|\bbatir\b|\bmorcele/

/** Un hectare en mètres carrés — l'unité dans laquelle tout est stocké. */
export const HECTARE_M2 = 10_000

/**
 * Surface écrite dans le texte : « 600 m² », « 3 hectares », « 9 ha », « 5000m2 ».
 * Sert quand la colonne est vide — c'est le cas d'un terrain sur cinq.
 */
export function extraireSurfaceTerrain(texte: string | null | undefined): number | null {
  const t = sansAccents((texte ?? "").replace(/ | /g, " "))

  // Hectares d'abord : « 3 ha » vaut 30 000 m², pas 3. L'inverse ferait passer
  // une plantation pour un mouchoir de poche.
  const ha = t.match(/(\d+(?:[.,]\d+)?)\s*(?:hectares?|ha)\b/)
  if (ha) {
    const n = Number(ha[1].replace(",", "."))
    if (Number.isFinite(n) && n > 0 && n <= 10_000) return Math.round(n * HECTARE_M2)
  }

  const m2 = t.match(/(\d{2,7}(?:[ .]\d{3})?)\s*(?:m2|m²|metres?\s*carres?)\b/)
  if (m2) {
    const n = Number(m2[1].replace(/[ .]/g, ""))
    if (Number.isFinite(n) && n >= 50 && n <= 100_000_000) return n
  }
  return null
}

/**
 * Usage d'un terrain.
 *
 * Le texte prime sur la surface : un vendeur qui écrit « agricole » sait ce
 * qu'il vend, alors qu'un seuil de surface n'est qu'une approximation. La
 * surface ne sert qu'à défaut, et seulement pour les cas francs — au-delà d'un
 * hectare on n'achète pas pour poser une maison, en dessous de 1 000 m² on ne
 * cultive pas.
 *
 * Entre les deux, `indetermine` : mieux vaut l'avouer que ranger un bien dans
 * une famille où l'acheteur ne le cherchera pas.
 */
export function usageTerrain(
  texte: string | null | undefined,
  surface: number | null | undefined,
): UsageTerrain {
  const t = sansAccents(texte ?? "")

  if (AGRICOLE.test(t)) return "agricole"
  if (COMMERCIAL.test(t)) return "commercial"
  if (HABITATION.test(t)) return "habitation"

  const s = surface ?? extraireSurfaceTerrain(texte)
  if (s == null) return "indetermine"
  if (s >= HECTARE_M2) return "agricole"
  if (s <= 1_000) return "habitation"
  return "indetermine"
}

export const LIBELLE_USAGE: Record<UsageTerrain, string> = {
  habitation: "Lot à bâtir",
  agricole: "Agricole / plantation",
  commercial: "Commercial / industriel",
  indetermine: "Non précisé",
}

export interface TrancheSurface {
  cle: string
  label: string
  min: number | null
  max: number | null
}

/**
 * Tranches calées sur le marché RÉEL, pas sur des chiffres ronds arbitraires :
 * 515 terrains tombent entre 300 et 700 m², d'où une tranche dédiée au lot
 * standard. Une tranche qui ne contient rien ne sert qu'à décevoir.
 */
export const TRANCHES_SURFACE: TrancheSurface[] = [
  { cle: "petit",   label: "Moins de 300 m²",       min: null,        max: 300 },
  { cle: "lot",     label: "300 à 700 m² (lot)",    min: 300,         max: 700 },
  { cle: "grand",   label: "700 m² à 2 000 m²",     min: 700,         max: 2_000 },
  { cle: "tres",    label: "2 000 m² à 1 hectare",  min: 2_000,       max: HECTARE_M2 },
  { cle: "hectare", label: "Plus d'un hectare",     min: HECTARE_M2,  max: null },
]

/** Affichage : en hectares dès qu'on dépasse le seuil, sinon en m². */
export function formaterSurface(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2)) return "—"
  if (m2 >= HECTARE_M2) {
    const ha = m2 / HECTARE_M2
    return `${ha % 1 === 0 ? ha : ha.toFixed(1)} ha`
  }
  return `${m2.toLocaleString("fr-FR")} m²`
}
