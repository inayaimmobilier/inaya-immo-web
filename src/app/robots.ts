import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

// robots.txt généré. On autorise l'indexation publique et on bloque les
// espaces privés / techniques. Les crawlers d'IA (ChatGPT, Claude, Perplexity,
// Google-Extended…) sont EXPLICITEMENT autorisés : l'objectif est que le
// catalogue Inaya soit citable par les assistants IA.
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/admin", "/api/", "/client", "/proprietaire", "/apporteur", "/prestataire", "/locataire", "/agent", "/verifier", "/connexion", "/inscription"]
  const aiBots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "Amazonbot"]

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Réaffirme l'autorisation pour chaque bot d'IA (certains ignorent la règle « * »).
      ...aiBots.map(userAgent => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
