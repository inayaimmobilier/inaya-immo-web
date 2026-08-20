import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data } = await db.from("vehicules_publics").select("*").eq("id", id).maybeSingle()
  if (!data) return NextResponse.json({ error: "introuvable" }, { status: 404 })

  const [photos, equipements, tarifs] = await Promise.all([
    db.from("vehicule_photos").select("url,principale,ordre").eq("vehicule_id", id).order("ordre"),
    db.from("vehicule_equipements").select("equipement").eq("vehicule_id", id),
    db.from("vehicule_tarifs").select("jour_min,jour_max,prix_jour").eq("vehicule_id", id).order("jour_min"),
  ])

  const codes = ((equipements.data ?? []) as { equipement: string }[]).map(e => e.equipement)
  const { data: libelles } = codes.length
    ? await db.from("equipements_vehicule").select("libelle").in("code", codes)
    : { data: [] }

  const urls = ((photos.data ?? []) as { url: string }[]).map(p => p.url)
  const videoUrl = (data as { video_url: string | null }).video_url

  // `media` reprend le format de la galerie des annonces : l'application a
  // déjà un composant qui affiche photos ET vidéos, lance la lecture de la
  // diapositive visible et propose l'enregistrement. Réinventer un carrousel
  // pour les voitures aurait donné deux comportements différents dans la même
  // application.
  //
  // La vidéo est placée EN TÊTE : c'est ce qu'un client veut voir en premier
  // sur une voiture, et elle se lance alors toute seule.
  const media = [
    ...(videoUrl ? [{ url: videoUrl, type: "video", thumbnail_url: urls[0] ?? null }] : []),
    ...urls.map(u => ({ url: u, type: "image", thumbnail_url: null })),
  ]

  return NextResponse.json({
    vehicule: data,
    media,
    // `photos` reste renvoyé : les applications déjà installées l'attendent,
    // et une mise à jour n'est jamais installée par tout le monde le même jour.
    photos: urls,
    equipements: ((libelles ?? []) as { libelle: string }[]).map(e => e.libelle),
    tarifs: tarifs.data ?? [],
  })
}
