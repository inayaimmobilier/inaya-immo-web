import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// API publique de l'app mobile — DÉTAIL d'une annonce publiée.
// Mêmes règles que la fiche web /biens/[id] : uniquement du contenu public,
// jamais les coordonnées du propriétaire (mise en relation médiée par Inaya).
// ============================================================================
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fmt = (n: number) => n.toLocaleString("fr-FR")
const PERIODE: Record<string, string> = { nuit: "par nuit", semaine: "par semaine", mois: "par mois" }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  // Accepte l'UUID ou la référence courte (N°1234).
  let q = admin.from("properties")
    .select("*, property_media(url, type, ordre, thumbnail_url, taille_bytes)")
    .eq("statut", "publie").limit(1)
  if (UUID_RE.test(id)) q = q.eq("id", id)
  else if (/^\d{1,7}$/.test(id)) q = q.eq("reference", Number(id))
  else return NextResponse.json({ error: "introuvable" }, { status: 404 })

  const { data } = await q.maybeSingle()
  type Row = {
    id: string; reference: number | null; titre: string; description: string | null
    type_offre: string; categorie: string; prix: number | null; prix_m2: number | null
    surface: number | null; nb_pieces: number | null; nb_chambres: number | null; nb_sdb: number | null
    meuble: boolean | null; quartier: string | null; ville: string | null
    tarif_periode: string | null; forfaits: string | null; disponible: boolean | null
    mois_caution: number | null; mois_avance: number | null; mois_agence: number | null
    cout_cession: number | null; loyer_cession: number | null; conditions_acquisition: string | null
    created_at: string
    property_media?: { url: string; type: string; ordre: number; thumbnail_url: string | null; taille_bytes: number | null }[]
  }
  const prop = data as Row | null
  if (!prop) return NextResponse.json({ error: "introuvable" }, { status: 404 })

  // Déduplication médias (même fichier reposté = même taille) — comme le web.
  const seen = new Set<string>()
  const media = (prop.property_media ?? [])
    .sort((a, b) => a.ordre - b.ordre)
    .filter(m => {
      const key = m.taille_bytes != null ? `${m.type}:${m.taille_bytes}` : `url:${m.url}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    .map(m => ({ url: m.url, type: m.type, thumbnail_url: m.thumbnail_url }))

  const isResid = prop.type_offre === "residence_meublee"
  const prixTexte = prop.categorie === "terrain" && prop.prix_m2
    ? `${fmt(prop.prix_m2)} FCFA/m²`
    : prop.prix && prop.prix > 0
      ? `${fmt(prop.prix)} FCFA${isResid ? ` ${PERIODE[prop.tarif_periode ?? "nuit"] ?? "par nuit"}` : prop.type_offre === "location" ? "/mois" : ""}`
      : "Prix sur demande"

  return NextResponse.json({
    id: prop.id, reference: prop.reference, titre: prop.titre, description: prop.description,
    type_offre: prop.type_offre, categorie: prop.categorie,
    prix: prop.prix, prix_texte: prixTexte, prix_m2: prop.prix_m2,
    surface: prop.surface, nb_pieces: prop.nb_pieces, nb_chambres: prop.nb_chambres, nb_sdb: prop.nb_sdb,
    meuble: isResid ? true : !!prop.meuble,
    quartier: prop.quartier, ville: prop.ville,
    tarif_periode: prop.tarif_periode, forfaits: prop.forfaits,
    disponible: prop.disponible !== false,
    conditions: prop.type_offre === "location"
      ? { mois_caution: prop.mois_caution, mois_avance: prop.mois_avance, mois_agence: prop.mois_agence }
      : prop.type_offre === "cession"
        ? { cout_cession: prop.cout_cession, loyer_cession: prop.loyer_cession, conditions_acquisition: prop.conditions_acquisition }
        : null,
    media,
    created_at: prop.created_at,
  }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } })
}
