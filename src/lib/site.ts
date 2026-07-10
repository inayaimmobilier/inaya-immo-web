// ============================================================================
// Constantes d'identité du site — utilisées par le SEO (metadata, sitemap,
// robots, JSON-LD, llms.txt). URL configurable via NEXT_PUBLIC_SITE_URL
// (repli sur le domaine de production). Toujours sans slash final.
// ============================================================================

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.inaya.ci"
).replace(/\/$/, "")

export const SITE_NAME = "Inaya Immo"
export const SITE_DESCRIPTION =
  "Inaya Immo — plateforme immobilière de référence à Bouaké (Côte d'Ivoire). " +
  "Location, vente, cession de bail et résidences meublées : appartements, maisons, " +
  "villas, terrains et locaux commerciaux, vérifiés par notre équipe."

/** URL absolue à partir d'un chemin interne. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}
