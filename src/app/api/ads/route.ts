import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// Route PUBLIQUE : renvoie les pubs actives pour un emplacement (placement),
// triées par priorité. Si une pub a un property_id, on JOIN properties pour
// récupérer la photo + titre + lien réels (mise en avant d'un bien).
//
// Exemple : /api/ads?placement=home
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const placement = req.nextUrl.searchParams.get("placement")
  if (!placement) return NextResponse.json([])

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // 1. Récupère les emplacements actifs pour ce placement
  const { data: spaces } = await admin.from("ad_spaces")
    .select("id,nom,slug,format,placement,nb_slots,rotation_delay_sec")
    .eq("actif", true)
    .eq("placement", placement)
    .order("ordre")

  const adSpaces = (spaces ?? []) as {
    id: string; nom: string; slug: string; format: string
    placement: string; nb_slots: number; rotation_delay_sec: number
  }[]
  if (adSpaces.length === 0) return NextResponse.json([])

  // 2. Récupère les pubs actives de ces emplacements (dans la fenêtre temporelle)
  const spaceIds = adSpaces.map(s => s.id)
  const { data: items } = await admin.from("ad_items")
    .select(`
      id,ad_space_id,titre,sous_titre,description,cta_label,cta_lien,
      image_url,video_url,couleur,icone,property_id,priority,
      properties!ad_items_property_id_fkey(id,titre,quartier,prix)
    `)
    .in("ad_space_id", spaceIds)
    .eq("actif", true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("priority", { ascending: false })

  const adItems = (items ?? []) as Array<{
    id: string; ad_space_id: string; titre: string; sous_titre: string | null
    description: string | null; cta_label: string | null; cta_lien: string | null
    image_url: string | null; video_url: string | null; couleur: string
    icone: string; property_id: string | null; priority: number
    properties: { id: string; titre: string; quartier: string | null; prix: number } | { id: string; titre: string; quartier: string | null; prix: number }[] | null
  }>

  // 2b. Cover des biens mis en avant sans image_url propre : on récupère la 1re
  // photo (ou la miniature d'une vidéo) du bien pour l'afficher dans la pub.
  const coverByProp = new Map<string, string>()
  const propIds = Array.from(new Set(adItems.filter(it => !it.image_url && it.property_id).map(it => it.property_id as string)))
  if (propIds.length) {
    const { data: medias } = await admin.from("property_media")
      .select("property_id,url,type,ordre,thumbnail_url")
      .in("property_id", propIds).order("ordre", { ascending: true })
    for (const m of (medias ?? []) as { property_id: string; url: string; type: string; thumbnail_url: string | null }[]) {
      if (coverByProp.has(m.property_id)) continue
      const cover = m.type === "image" ? m.url : m.thumbnail_url
      if (cover) coverByProp.set(m.property_id, cover)
    }
  }

  // 3. Groupe par emplacement, en plafonnant par nb_slots si défini
  const bySpace = new Map<string, unknown[]>()
  for (const s of adSpaces) bySpace.set(s.id, [])
  for (const it of adItems) {
    const arr = bySpace.get(it.ad_space_id)
    if (!arr) continue
    // Résolution property : si property_id set, on privilégie photo+titre+lien du bien
    const prop = Array.isArray(it.properties) ? it.properties[0] : it.properties
    arr.push({
      id: it.id,
      titre: prop?.titre ?? it.titre,
      sous_titre: it.sous_titre,
      description: it.description,
      cta_label: it.cta_label ?? (prop ? "Voir l'annonce" : null),
      cta_lien: it.cta_lien ?? (prop ? `/biens/${prop.id}` : null),
      image_url: it.image_url ?? (it.property_id ? coverByProp.get(it.property_id) ?? null : null), // cover du bien à défaut
      video_url: it.video_url,
      couleur: it.couleur,
      icone: it.icone,
      property_id: it.property_id,
      property_titre: prop?.titre ?? null,
      property_quartier: prop?.quartier ?? null,
      property_prix: prop?.prix ?? null,
    })
  }

  // 4. Format de sortie : un tableau { space, items[] }
  const result = adSpaces.map(s => {
    const all = bySpace.get(s.id) ?? []
    return {
      space: { slug: s.slug, nom: s.nom, format: s.format, nb_slots: s.nb_slots, rotation_delay_sec: s.rotation_delay_sec },
      items: all.slice(0, s.nb_slots || all.length),
    }
  })

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
