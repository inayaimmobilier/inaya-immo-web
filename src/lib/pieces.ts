// ============================================================================
// NOMBRE DE PIÈCES — vocabulaire ivoirien et déduction depuis l'annonce.
//
// À Bouaké on ne dit pas « 3 pièces », on dit « 2 chambres salon ». Le salon
// compte pour une pièce : N pièces = N-1 chambres. Le studio et l'entrée
// couchée font une seule pièce.
//
// Les libellés portent les deux formulations : un visiteur qui cherche « 3
// chambres salon » doit reconnaître son besoin sans faire le calcul.
// ============================================================================

/** Libellés des filtres « nombre de pièces minimum ». */
export const PIECES_LIBELLES: { value: string; label: string }[] = [
  { value: "1", label: "1 pièce — studio ou entrée couchée" },
  { value: "2", label: "2 pièces — chambre salon" },
  { value: "3", label: "3 pièces — 2 chambres salon" },
  { value: "4", label: "4 pièces — 3 chambres salon" },
  { value: "5", label: "5 pièces ou + — 4 chambres salon et +" },
]

/** Champs d'une annonce utiles à la déduction. */
export type AnnoncePieces = {
  titre?: string | null
  description?: string | null
  categorie?: string | null
  nb_pieces?: number | null
  nb_chambres?: number | null
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/** « entrée couchée » et toutes ses graphies (entré couché, entrer coucher…). */
export const ENTREE_COUCHEE = /entr[a-z]*[\s-]*couch/

/**
 * Nombre de chambres déduit d'une annonce, même si la colonne est vide :
 *  - colonne nb_chambres si présente ;
 *  - « X chambres » / « X pièces » dans le titre ou la description
 *    (X pièces = X-1 chambres, le salon comptant comme une pièce) ;
 *  - « chambre salon » sans chiffre = 1 chambre ;
 *  - studio ou entrée couchée = 0 chambre ;
 *  - sinon nb_pieces - 1 ; sinon indéterminé (null).
 *
 * EXCEPTION CITÉ : « Cité de 3 logements 2 pièces » ou « 3 fois chambre salon »
 * décrit X LOGEMENTS SÉPARÉS d'une chambre chacun — pas une maison de X
 * chambres. On renvoie donc 1 chambre par logement.
 */
export function chambresDeduites(p: AnnoncePieces): number | null {
  if (typeof p.nb_chambres === "number") return p.nb_chambres
  const hay = sansAccents(`${p.titre ?? ""} ${p.description ?? ""}`)
  const citeM = hay.match(/(\d+)\s*(?:fois|unites?|exemplaires?|logements?)\s*(?:de\s*)?chambre\s*salon/i)
    ?? hay.match(/chambre\s*salon\s*(?:disponible\s*)?en\s*(\d+)\s*(?:exemplaires?|unites?|logements?|fois)/i)
    ?? hay.match(/(\d+)\s*chambre\s*salon\s+en\s+cit/i)
    ?? hay.match(/cit[ée]\s+de\s+(\d+)\s*logements?/)
  if (citeM) return 1
  const m = hay.match(/(\d+)\s*(chambres?|pieces?|pces?)/)
  if (m) {
    const n = Number(m[1])
    return /piece|pce/.test(m[2]) ? Math.max(0, n - 1) : n
  }
  if (/chambre\s*salon|chbre\s*salon|\bch\s*salon/.test(hay)) return 1
  if (typeof p.nb_pieces === "number") return Math.max(0, p.nb_pieces - 1)
  // Studio / entrée couchée : une seule pièce. Testé APRÈS les chiffres et
  // « chambre salon » : « villa 4 pièces avec studio » reste une villa de 4
  // pièces. On ne regarde que la catégorie et le TITRE — une description qui
  // mentionne « proche d'un studio photo » ne fait pas d'un duplex un studio.
  // Sans cette règle, un studio sans chiffre restait « indéterminé » et
  // passait un filtre « 4 pièces » (constaté le 17/09/2026).
  const titre = sansAccents(p.titre ?? "")
  if (sansAccents(p.categorie ?? "") === "studio" || /\bstudio/.test(titre) || ENTREE_COUCHEE.test(titre)) return 0
  return null
}

/** Nombre de pièces déduit (colonne d'abord, sinon chambres + salon), ou null. */
export function piecesDeduites(p: AnnoncePieces): number | null {
  if (typeof p.nb_pieces === "number" && p.nb_pieces > 0) return p.nb_pieces
  const c = chambresDeduites(p)
  return c == null ? null : c + 1
}
