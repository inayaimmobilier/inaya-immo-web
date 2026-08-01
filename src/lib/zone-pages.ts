// ============================================================================
// Pages de destination par QUARTIER et par TYPE D'OFFRE.
//
// Pourquoi : le site déclarait 4 pages d'atterrissage pour 4 923 annonces.
// Or personne ne cherche « annonces immobilières » — on cherche « location
// maison Air France Bouaké ». Chaque couple quartier × offre suffisamment
// fourni mérite donc sa page, avec son titre, son texte et son maillage.
//
// Les combinaisons sont DÉDUITES du catalogue, jamais écrites en dur : un
// quartier qui se remplit apparaît tout seul, un quartier qui se vide disparaît.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

/** En dessous, la page n'aurait pas assez de contenu pour être utile. */
export const MIN_ANNONCES = 5

export const OFFRES = {
  location: { slug: "location", label: "Location", titre: "à louer", verbe: "louer" },
  vente: { slug: "vente", label: "Vente", titre: "à vendre", verbe: "acheter" },
  residence_meublee: { slug: "meublee", label: "Résidence meublée", titre: "meublées", verbe: "réserver" },
  cession: { slug: "cession", label: "Cession de bail", titre: "en cession", verbe: "reprendre" },
} as const
export type OffreKey = keyof typeof OFFRES

/** Retrouve le type d'offre à partir du segment d'URL. */
export function offreFromSlug(slug: string): OffreKey | null {
  const e = (Object.keys(OFFRES) as OffreKey[]).find(k => OFFRES[k].slug === slug)
  return e ?? null
}

/** « Cité CIDT » → « cite-cidt » ; « N'Dakro » → « n-dakro ». */
export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

export interface ZoneCombo {
  ville: string; villeSlug: string
  quartier: string; quartierSlug: string
  offre: OffreKey; total: number
}

/**
 * Toutes les combinaisons ville × quartier × offre du catalogue publié.
 * Coûteux (lecture paginée complète) : à n'appeler que depuis des pages mises
 * en cache (revalidate) ou le sitemap, jamais dans un rendu à la demande.
 */
export async function allCombos(): Promise<ZoneCombo[]> {
  const admin = createAdminClient()
  const PAGE = 1000
  const rows: { ville: string | null; quartier: string | null; type_offre: string }[] = []
  for (let page = 0; page < 12; page++) {
    // PostgREST plafonne à 1000 lignes : order + range obligatoires.
    const { data, error } = await admin.from("properties")
      .select("ville,quartier,type_offre").eq("statut", "publie")
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) { console.error("INAYA-ZONES-010", error.message); break }
    const batch = (data ?? []) as typeof rows
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  const compte = new Map<string, ZoneCombo>()
  for (const r of rows) {
    const ville = (r.ville ?? "").trim()
    const quartier = (r.quartier ?? "").trim()
    if (!ville || !quartier) continue
    if (!(r.type_offre in OFFRES)) continue
    const offre = r.type_offre as OffreKey
    const cle = `${ville}|${quartier}|${offre}`
    const c = compte.get(cle)
    if (c) c.total++
    else compte.set(cle, {
      ville, villeSlug: slugify(ville),
      quartier, quartierSlug: slugify(quartier),
      offre, total: 1,
    })
  }
  return [...compte.values()].filter(c => c.total >= MIN_ANNONCES).sort((a, b) => b.total - a.total)
}

/** Résout une URL (offre / ville / quartier) vers la combinaison réelle. */
export async function findCombo(offreSlug: string, villeSlug: string, quartierSlug: string): Promise<ZoneCombo | null> {
  const offre = offreFromSlug(offreSlug)
  if (!offre) return null
  const combos = await allCombos()
  return combos.find(c =>
    c.offre === offre && c.villeSlug === villeSlug && c.quartierSlug === quartierSlug) ?? null
}

/** Quartiers voisins : même ville, même offre — le maillage interne de la page. */
export async function voisins(combo: ZoneCombo, limite = 8): Promise<ZoneCombo[]> {
  const combos = await allCombos()
  return combos
    .filter(c => c.offre === combo.offre && c.ville === combo.ville && c.quartier !== combo.quartier)
    .slice(0, limite)
}

export const cheminCombo = (c: ZoneCombo) =>
  `/immobilier/${OFFRES[c.offre].slug}/${c.villeSlug}/${c.quartierSlug}`
