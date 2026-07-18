// ============================================================================
// Catégories de RECHERCHE sauvegardée : mapping des types admin → enum Postgres.
//
// La colonne search_requests.categories est un enum (property_cat[]) limité à :
// maison, appartement, studio, terrain, local_commercial, bureau, magasin, autre.
// Or l'admin peut proposer des types plus fins (« villa », « entrepôt »…) qui
// n'existent PAS dans l'enum : les insérer tels quels ferait échouer la création.
// Même logique que la recherche publique (/biens) : une villa est une `maison`
// au titre « Villa … ». On mappe donc chaque code vers sa FAMILLE enum, et on
// conserve les sous-types précis à part (affichés dans les précisions).
// ============================================================================

import type { PropertyCat } from "@/types/database"

const ENUM_CATS = new Set<PropertyCat>([
  "maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre",
])

// Sous-types d'HABITATION → famille « maison » (aligné sur /biens/page.tsx).
const RESIDENTIEL_SUB = new Set(["villa", "immeuble", "duplex", "chambre", "residence", "logement"])
// Sous-types de COMMERCE → famille « local_commercial ».
const COMMERCE_SUB = new Set(["boutique", "commerce", "entrepot", "kiosque", "maquis", "restaurant"])

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

/**
 * Normalise une liste de codes (types admin) vers l'enum de la base.
 * Renvoie les catégories enum (dédupliquées) et les sous-types précis non stockables
 * (ex. « villa ») à consigner dans les précisions de la recherche.
 */
export function normalizeSearchCategories(codes: (string | null | undefined)[]): {
  cats: PropertyCat[]; sousTypes: string[]
} {
  const cats = new Set<PropertyCat>()
  const sousTypes: string[] = []
  for (const raw of codes) {
    const c = norm(raw ?? "")
    if (!c) continue
    if (ENUM_CATS.has(c as PropertyCat)) { cats.add(c as PropertyCat); continue }
    if (RESIDENTIEL_SUB.has(c)) { cats.add("maison"); sousTypes.push(c); continue }
    if (COMMERCE_SUB.has(c)) { cats.add("local_commercial"); sousTypes.push(c); continue }
    // Type admin inconnu de l'enum : famille indéterminée → « autre », sous-type noté.
    cats.add("autre"); sousTypes.push(c)
  }
  return { cats: [...cats], sousTypes: [...new Set(sousTypes)] }
}

const SOUS_TYPE_PREFIX = "Sous-type souhaité :"

/**
 * Ajoute (ou remplace) la note « Sous-type souhaité : villa » dans les précisions,
 * sans dupliquer la note à chaque modification de la recherche.
 */
export function withSousTypesNote(description: string | null, sousTypes: string[]): string | null {
  const base = (description ?? "")
    .split("\n")
    .filter(l => !l.trimStart().startsWith(SOUS_TYPE_PREFIX))
    .join("\n")
    .trim()
  if (sousTypes.length === 0) return base || null
  return [base, `${SOUS_TYPE_PREFIX} ${sousTypes.join(", ")}`].filter(Boolean).join("\n")
}
