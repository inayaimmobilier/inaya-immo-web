// ============================================================================
// SOUS-TYPES reconnus au TEXTE de l'annonce, pas à la colonne `categorie`.
//
// L'admin propose des types (conteneur, maquis, cave, boutique, espace…) qui
// n'existent PAS dans l'énumération `property_cat` (maison, appartement,
// studio, terrain, local_commercial, bureau, magasin, autre). L'ingestion
// WhatsApp range un maquis en `local_commercial`, un conteneur en `autre` ou
// `magasin`… avec le vrai type dans le TITRE (vérifié le 25/09/2026 : ~50
// conteneurs publiés à Bouaké, zéro en categorie='conteneur'). Filtrer sur la
// colonne seule ne renvoyait donc jamais rien.
// ============================================================================

const sansAccents = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Valeurs réelles de la colonne `categorie` (enum property_cat). */
const CATEGORIES_EN_BASE = ["maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre"]

/** Vocabulaire d'habitation : géré ailleurs par familles (une villa est une `maison`). */
const HABITATION = ["villa", "duplex", "immeuble", "chambre", "residence", "logement"]

const LOGEMENT = ["maison", "appartement", "studio"]

type Regle = {
  motif: RegExp
  /** Catégories où le mot n'est qu'un REPÈRE : « Studio à louer — proche maquis Gbonhi ». */
  exclues: string[]
}

const SOUS_TYPES: Record<string, Regle> = {
  conteneur: { motif: /\b(conteneur|contener|conteiner|container|contenaire)s?\b/, exclues: [...LOGEMENT, "terrain"] },
  maquis: { motif: /\bmaquis\b/, exclues: [...LOGEMENT, "terrain"] },
  salon_de_coiffure: { motif: /\bcoiffure|\bcoiffeu(r|se)s?\b|\bbarber/, exclues: [...LOGEMENT, "terrain"] },
  restaurant: { motif: /\brestaurants?\b|\bresto\b|\bfast[- ]?food|\bgargotes?\b/, exclues: [...LOGEMENT, "terrain"] },
  // En Côte d'Ivoire, une « cave » est un débit de boissons, pas un sous-sol.
  cave: { motif: /\bcaves?\b/, exclues: [...LOGEMENT, "terrain"] },
  boutique: { motif: /\bboutiques?\b/, exclues: [...LOGEMENT, "terrain"] },
  // « Espace de 2000 m² à louer » est parfois rangé en terrain : on le garde.
  espace: { motif: /\bespaces?\b/, exclues: LOGEMENT },
}

/** Règle d'un code : explicite, sinon déduite du code lui-même (type ajouté plus tard par l'admin). */
function regle(code: string): Regle | null {
  const c = sansAccents(code).trim()
  if (SOUS_TYPES[c]) return SOUS_TYPES[c]
  if (!c || CATEGORIES_EN_BASE.includes(c) || HABITATION.includes(c)) return null
  const mots = c.replace(/[^a-z0-9]+/g, " ").trim()
  if (!mots) return null
  return { motif: new RegExp(`\\b${mots.replace(/ /g, "\\s+")}`), exclues: [...LOGEMENT, "terrain"] }
}

/** Vrai si ce code de type se reconnaît au texte plutôt qu'à la colonne. */
export const estSousTypeTexte = (code: string) => regle(code) !== null

/**
 * Vrai si l'annonce correspond au sous-type. Le TITRE fait foi. La description
 * n'est lue que si le titre ne dit RIEN (« Autre à vendre », généré quand l'IA
 * n'a pas su nommer le bien) : lue plus largement, elle faisait passer un
 * immeuble pour un « espace » parce que sa description vantait « un grand espace ».
 */
export function correspondSousType(
  code: string,
  bien: { categorie?: string | null; titre?: string | null; description?: string | null },
): boolean {
  const r = regle(code)
  if (!r) return false
  const cat = sansAccents(bien.categorie)
  if (r.exclues.includes(cat)) return false
  const titre = sansAccents(bien.titre).trim()
  if (r.motif.test(titre)) return true
  const titreMuet = !titre || /^autres?\b/.test(titre)
  return titreMuet && r.motif.test(sansAccents(bien.description))
}
