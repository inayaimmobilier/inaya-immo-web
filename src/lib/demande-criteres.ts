// ============================================================================
// Critères DÉDUITS du texte libre d'une demande.
//
// Les demandes issues des groupes WhatsApp arrivent souvent avec les colonnes
// `categories` et `type_offre` vides : l'extraction n'a pas su les remplir. Or
// le moteur traitait « non renseigné » comme « accepte tout ». Résultat mesuré
// sur les alertes réellement envoyées : 74 alertes issues de demandes sans
// catégorie, dont 23 où le bien CONTREDISAIT le texte de la demande — une
// personne réclamant « deux ou trois chambres salon » a reçu huit studios.
//
// L'information était pourtant écrite noir sur blanc dans la demande. On la
// lit donc, au lieu de conclure de son absence que tout convient.
//
// Le vocabulaire est aligné sur `search-cats.ts` : mêmes familles, mêmes
// équivalences (une villa est une `maison`, une boutique un `local_commercial`).
// ============================================================================

import type { PropertyCat, PropertyType } from "@/types/database"

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/**
 * Familles reconnaissables dans une phrase. L'ordre compte peu, mais la
 * précision oui : « studio » est une catégorie À PART de `appartement` dans
 * l'enum, et c'est exactement la confusion qui a produit les mauvaises
 * alertes — qui demande « 2 chambres salon » ne veut pas d'un studio.
 */
const VOCABULAIRE: { cat: PropertyCat; mots: RegExp }[] = [
  { cat: "studio",           mots: /\bstudios?\b|\bentree?s?\s*couchees?\b|\bstudio\s*americain\b/ },
  { cat: "terrain",          mots: /\bterrains?\b|\bparcelles?\b|\bhectares?\b|\blotissements?\b|\bacd\b|\blots?\s+de\s+terrain\b/ },
  { cat: "magasin",          mots: /\bmagasins?\b/ },
  { cat: "bureau",           mots: /\bbureaux?\b/ },
  { cat: "local_commercial", mots: /\blocal\s+commercial\b|\bboutiques?\b|\bentrepots?\b|\bcommerces?\b|\bmaquis\b|\brestaurants?\b|\bkiosques?\b/ },
  { cat: "maison",           mots: /\bmaisons?\b|\bvillas?\b|\bduplex\b|\bpavillons?\b|\bcour\s+commune\b|\bimmeubles?\b/ },
  // « 2 chambres salon », « trois pièces salon » : l'habitation à plusieurs
  // pièces de la langue courante ici. Volontairement APRÈS `studio`, qui est
  // détecté d'abord et l'emporte quand les deux figurent.
  { cat: "appartement",      mots: /\bappartements?\b|\bchambres?\s*salon\b|\bpieces?\s*salon\b|\b\d+\s*pieces?\b/ },
]

/** « à louer », « à vendre » : dit explicitement dans presque chaque demande. */
const LOCATION = /\ba\s+louer\b|\blouer\b|\blocation\b|\bloyer\b|\bbail\b/
const VENTE    = /\ba\s+vendre\b|\bvendre\b|\bvente\b|\bachat\b|\bacheter\b|\backerir\b/

export interface CriteresDeduits {
  categories: PropertyCat[] | null
  typeOffre: PropertyType | null
}

/**
 * Lit le texte libre d'une demande et en tire catégories et type d'offre.
 * Renvoie `null` pour ce qu'on ne sait pas : on ne devine pas, on lit.
 */
export function deduireCriteres(texte: string | null | undefined): CriteresDeduits {
  const t = sansAccents((texte ?? "").trim())
  if (!t) return { categories: null, typeOffre: null }

  const cats = VOCABULAIRE.filter(v => v.mots.test(t)).map(v => v.cat)

  // Une demande d'habitation à plusieurs pièces peut aussi bien être satisfaite
  // par une maison que par un appartement : la distinction est floue dans le
  // parc local, et l'exclure ferait perdre de vraies correspondances. Un studio,
  // lui, reste exclu — c'est précisément ce qu'on cherchait à écarter.
  if (cats.includes("appartement") && !cats.includes("maison")) cats.push("maison")

  const loue = LOCATION.test(t)
  const vend = VENTE.test(t)

  return {
    categories: cats.length > 0 ? [...new Set(cats)] : null,
    // Les deux mentionnés = ambigu, on ne tranche pas.
    typeOffre: loue && !vend ? "location" : vend && !loue ? "vente" : null,
  }
}
