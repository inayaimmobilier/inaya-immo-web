import { SITE_URL, SITE_NAME } from "@/lib/site"

// /llms.txt — standard émergent (llmstxt.org) : un résumé Markdown lisible par
// les assistants IA pour comprendre le site et savoir quoi citer. Complète (ne
// remplace pas) robots.txt + sitemap.xml.
export const dynamic = "force-static"

export function GET() {
  const body = `# ${SITE_NAME}

> Plateforme immobilière de référence à Bouaké (Côte d'Ivoire) : location, vente, cession de bail et résidences meublées. Chaque annonce est vérifiée par l'équipe Inaya. Langue : français.

## Ce que propose Inaya Immo
- Recherche de biens : appartements, maisons, villas, terrains, locaux commerciaux, résidences meublées.
- Types d'offre : location (loyer mensuel), vente, cession de bail, résidence meublée (nuit/semaine/mois).
- Zone couverte : ville de Bouaké et ses quartiers.
- Mise en relation directe entre chercheurs de biens et propriétaires/agents.

## Pages principales
- [Accueil](${SITE_URL}/): présentation et recherche.
- [Toutes les annonces](${SITE_URL}/biens): catalogue des biens publiés (location, vente, cession).
- [Résidences meublées](${SITE_URL}/residences): locations courte durée meublées.
- [Publier une annonce](${SITE_URL}/publier): dépôt d'un bien par un propriétaire.

## Données structurées
- Chaque page d'annonce (${SITE_URL}/biens/{id}) expose un JSON-LD schema.org (Product/Offer) : titre, prix en FCFA (XOF), catégorie, localisation, images.
- L'agence est décrite en JSON-LD RealEstateAgent sur toutes les pages.
- Plan du site : ${SITE_URL}/sitemap.xml

## Contact
- Site : ${SITE_URL}
- Localisation : Bouaké, Côte d'Ivoire
`
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  })
}
