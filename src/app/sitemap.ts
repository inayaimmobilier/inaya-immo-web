import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/server"
import { SITE_URL } from "@/lib/site"

export const revalidate = 3600 // régénéré au plus toutes les heures

// Sitemap dynamique : pages statiques publiques + TOUTES les annonces publiées
// (le contenu à référencer). Client admin pour lister sans dépendre de la RLS.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,           changeFrequency: "daily",  priority: 1.0 },
    { url: `${SITE_URL}/biens`,      changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/residences`, changeFrequency: "daily",  priority: 0.8 },
    { url: `${SITE_URL}/publier`,    changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/immobilier`, changeFrequency: "daily",  priority: 0.9 },
  ]

  // Pages par quartier : c'est là que se joue la recherche réelle des visiteurs
  // (« location maison Air France Bouaké »), pas sur la liste générale.
  let zones: MetadataRoute.Sitemap = []
  try {
    const { allCombos, cheminCombo } = await import("@/lib/zone-pages")
    zones = (await allCombos()).map(c => ({
      url: `${SITE_URL}${cheminCombo(c)}`,
      changeFrequency: "daily" as const,
      // Un quartier bien fourni mérite un peu plus de poids qu'un quartier limite.
      priority: c.total >= 50 ? 0.8 : 0.6,
    }))
  } catch (e) {
    console.error("INAYA-SITEMAP-ZONES", e)
  }

  let listings: MetadataRoute.Sitemap = []
  try {
    const { data } = await createAdminClient()
      .from("properties")
      .select("id, updated_at, validated_at, created_at")
      .eq("statut", "publie")
      .order("validated_at", { ascending: false })
      .limit(5000)
    listings = ((data ?? []) as { id: string; updated_at: string | null; validated_at: string | null; created_at: string }[])
      .map(p => ({
        url: `${SITE_URL}/biens/${p.id}`,
        lastModified: new Date(p.updated_at ?? p.validated_at ?? p.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
  } catch {
    // Base injoignable au build → on renvoie au moins les pages statiques.
  }

  return [...staticRoutes, ...zones, ...listings]
}
