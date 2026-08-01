// ============================================================================
// Déduction du nombre de CHAMBRES et de PIÈCES à partir du texte d'une annonce.
//
// Pourquoi : 3 339 annonces publiées sur 4 923 n'avaient aucune valeur pour le
// nombre de chambres, alors que c'est le premier critère de recherche. Filtrer
// sur « 2 chambres » faisait donc disparaître la majorité du catalogue.
//
// Convention ivoirienne, lisible dans les annonces réelles : on annonce des
// PIÈCES, pas des chambres — « 3 pièces » = 2 chambres + le salon. La règle
// retenue est donc chambres = pièces − 1, appliquée UNIQUEMENT aux catégories
// d'habitation : dans un local commercial, « 3 pièces » ne désigne aucune
// chambre.
// ============================================================================

/** Catégories où « pièces » sous-entend un salon, donc chambres = pièces − 1. */
const HABITATION = new Set(["maison", "appartement", "studio", "duplex", "villa"])

const MOTS: Record<string, number> = {
  une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
}

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Convertit « 3 » ou « trois » en nombre, en refusant les valeurs absurdes. */
function nombre(raw: string): number | null {
  const n = /^\d+$/.test(raw) ? Number(raw) : MOTS[raw]
  return n && n >= 1 && n <= 20 ? n : null
}

export interface RoomsGuess {
  nb_chambres: number | null
  nb_pieces: number | null
  /** Ce qui a permis de conclure — utile pour vérifier un rattrapage en masse. */
  source: "chambres" | "chambre_salon" | "pieces" | "studio" | null
}

export function extractRooms(texte: string, categorie: string): RoomsGuess {
  const t = sansAccents(texte)
  const habitation = HABITATION.has(sansAccents(categorie))
  const vide: RoomsGuess = { nb_chambres: null, nb_pieces: null, source: null }

  // 1) Mention explicite de chambres — la plus fiable, elle prime sur tout.
  //    « 2 chambres », « 02 chambres », « deux chambres », « 3 ch ».
  const mCh = t.match(/(\d{1,2}|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:chambres?|chbres?|ch\b)/)
  if (mCh) {
    const n = nombre(mCh[1])
    if (n) return { nb_chambres: n, nb_pieces: null, source: "chambres" }
  }

  // 2) « chambre salon » (et ses abréviations) = une chambre + un salon.
  if (/\bchambres?\s*(?:-|\+|\/|et\s+)?\s*salon\b/.test(t) || /\bc\s*[\/+]\s*s\b/.test(t)) {
    return { nb_chambres: 1, nb_pieces: 2, source: "chambre_salon" }
  }

  // 3) « X pièces » : on retient toujours les pièces ; les chambres ne s'en
  //    déduisent que pour une habitation.
  const mP = t.match(/(\d{1,2}|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:pieces?|pces?)\b/)
  if (mP) {
    const p = nombre(mP[1])
    if (p) {
      return {
        nb_pieces: p,
        // « 1 pièce » désigne un logement d'une seule pièce, donc une chambre —
        // et non zéro, sans quoi ces annonces disparaissaient des filtres.
        nb_chambres: habitation ? Math.max(1, p - 1) : null,
        source: "pieces",
      }
    }
  }

  // 4) Studio, ou « entrée couchée » (le terme local) : une seule pièce à vivre.
  //    On la compte comme une chambre, parce qu'un visiteur qui cherche
  //    « 1 chambre » attend de voir ces logements dans ses résultats.
  if (sansAccents(categorie) === "studio" || /\bstudios?\b/.test(t) || /\bentree?\s*couchee?\b/.test(t)) {
    return { nb_chambres: 1, nb_pieces: 1, source: "studio" }
  }

  return vide
}
