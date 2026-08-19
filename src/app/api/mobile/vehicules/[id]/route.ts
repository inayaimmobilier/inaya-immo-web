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

  return NextResponse.json({
    vehicule: data,
    photos: ((photos.data ?? []) as { url: string }[]).map(p => p.url),
    equipements: ((libelles ?? []) as { libelle: string }[]).map(e => e.libelle),
    tarifs: tarifs.data ?? [],
  })
}
