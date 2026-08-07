import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { extraireSurfaceTerrain, usageTerrain, TRANCHES_SURFACE } from "@/lib/terrain"
import { searchProperties, type SearchArgs } from "@/lib/property-search"

// ============================================================================
// API publique de l'app mobile — LISTE des annonces publiées.
// Réutilise le moteur de recherche tolérant partagé (property-search) : mêmes
// résultats que les assistants. Renvoie des cartes prêtes à afficher (cover).
// Aucune donnée sensible : coordonnées propriétaire jamais incluses.
// ============================================================================
export const runtime = "nodejs"

const fmt = (n: number) => n.toLocaleString("fr-FR")
const PERIODE: Record<string, string> = { nuit: "/nuit", semaine: "/sem.", mois: "/mois" }

type MediaRow = { property_id: string; url: string; type: string; ordre: number; thumbnail_url: string | null }

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  // Multi-sélection (comme le web) : `categorie` et `quartier` peuvent contenir
  // plusieurs valeurs séparées par des virgules. Le moteur gère les types via
  // `categories[]` et les quartiers via le CSV de `quartier` (splitZones).
  const csv = (s: string | null) => (s ? s.split(",").map(x => x.trim()).filter(Boolean) : [])
  const cats = csv(p.get("categorie"))
  const args: SearchArgs = {
    type_offre: p.get("type_offre") ?? undefined,
    categories: cats.length ? cats : undefined,
    // `commune` accepte plusieurs valeurs séparées par des virgules, comme sur
    // le site : chercher de part et d'autre d'une limite communale est courant.
    communes: csv(p.get("commune")).length ? csv(p.get("commune")) : undefined,
    quartier: p.get("quartier") ?? undefined,
    prix_max: p.get("prix_max") ? Number(p.get("prix_max")) : undefined,
    prix_min: p.get("prix_min") ? Number(p.get("prix_min")) : undefined,
    chambres_min: p.get("chambres_min") ? Number(p.get("chambres_min")) : undefined,
    mots_cles: p.get("q") ?? undefined,
    tri: (p.get("tri") as SearchArgs["tri"]) ?? undefined,
    // Filtres explicites de l'app → recherche STRICTE (catégorie par univers,
    // quartier obligatoire, budget plafond dur). `strict=0` pour désactiver.
    strict: p.get("strict") !== "0",
  }
  const limit = Math.min(Number(p.get("limit")) || 24, 200)

  // ── TERRAINS : surface et usage, au lieu du nombre de pièces ───────────────
  //
  // « Terrain » recouvre deux marchés distincts : le lot à bâtir de 400 à
  // 600 m² et la parcelle agricole de plusieurs hectares. Demander un nombre
  // de pièces n'y a aucun sens ; c'est la surface et l'usage qui trient.
  //
  // Le filtre s'applique ICI et non dans l'application : appliqué après coup
  // sur la page reçue, il ne verrait que les vingt-quatre premiers résultats.
  const trancheDemandee = TRANCHES_SURFACE.find(t => t.cle === p.get("surface"))
  const usageDemande = p.get("usage") ?? ""

  let rows
  try {
    // Le tri par tranche écarte beaucoup d'annonces : on lit plus large pour
    // qu'il reste de quoi remplir la page.
    const brut = trancheDemandee || usageDemande ? Math.min(limit * 8, 400) : limit
    rows = await searchProperties(args, { limit: brut })
  }
  catch { return NextResponse.json({ error: "indisponible" }, { status: 503 }) }

  if (trancheDemandee || usageDemande) {
    rows = rows.filter(r => {
      const texte = `${r.titre ?? ""} ${r.description ?? ""}`
      // La colonne est vide sur un terrain sur cinq : on retombe alors sur la
      // surface écrite dans l'annonce plutôt que d'écarter le bien.
      const surface = r.surface ?? extraireSurfaceTerrain(texte)
      if (trancheDemandee) {
        if (surface == null) return false
        if (trancheDemandee.min != null && surface < trancheDemandee.min) return false
        if (trancheDemandee.max != null && surface >= trancheDemandee.max) return false
      }
      if (usageDemande && usageTerrain(texte, surface) !== usageDemande) return false
      return true
    }).slice(0, limit)
  }

  // Couvertures : 1 requête pour tous les médias de la page.
  const ids = rows.map(r => r.id)
  const admin = createAdminClient()
  const { data: mediaData } = ids.length
    ? await admin.from("property_media").select("property_id,url,type,ordre,thumbnail_url")
        .in("property_id", ids).order("ordre", { ascending: true })
    : { data: [] }
  const mediaBy = new Map<string, MediaRow[]>()
  for (const m of (mediaData ?? []) as MediaRow[]) {
    const list = mediaBy.get(m.property_id) ?? []
    list.push(m); mediaBy.set(m.property_id, list)
  }

  const items = rows.map(r => {
    const media = mediaBy.get(r.id) ?? []
    const cover = media.find(m => m.type === "image")?.url
      ?? media.find(m => m.thumbnail_url)?.thumbnail_url ?? null
    const isResid = r.type_offre === "residence_meublee"
    const prixTexte = r.categorie === "terrain" && r.prix_m2
      ? `${fmt(r.prix_m2)} F/m²`
      : r.prix && r.prix > 0
        ? `${fmt(r.prix)} F${isResid ? (PERIODE[r.tarif_periode ?? "nuit"] ?? "/nuit") : r.type_offre === "location" ? "/mois" : ""}`
        : "Prix sur demande"
    return {
      id: r.id, reference: r.reference, titre: r.titre,
      type_offre: r.type_offre, categorie: r.categorie,
      prix: r.prix, prix_texte: prixTexte,
      quartier: r.quartier, ville: r.ville,
      nb_pieces: r.nb_pieces, nb_chambres: r.nb_chambres, surface: r.surface,
      meuble: r.meuble, correspondance: r.correspondance,
      cover, media_count: media.length,
      video: media.some(m => m.type === "video"),
      created_at: r.created_at ?? null,
    }
  })

  return NextResponse.json({ items }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  })
}
