import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// Catalogue de véhicules pour l'APPLICATION MOBILE.
//
// Lecture par la VUE publique : elle ne contient ni VIN, ni traceur, ni notes
// internes. L'application ne doit pas devenir la porte d'entrée par laquelle
// fuient des données que le site protège.
// ============================================================================
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const db = createAdminClient()

  let q = db.from("vehicules_publics")
    .select("id,reference,marque,modele,type_vehicule,carburant,boite,nb_places," +
            "prix_jour,prix_semaine,ville,quartier,statut")
    .neq("statut", "archive")
    .order("prix_jour", { ascending: true, nullsFirst: false })
    .limit(100)

  if (p.get("type")) q = q.eq("type_vehicule", p.get("type")!)
  if (p.get("ville")) q = q.ilike("ville", p.get("ville")!)
  if (p.get("boite")) q = q.eq("boite", p.get("boite")!)
  if (p.get("carburant")) q = q.eq("carburant", p.get("carburant")!)

  const { data, error } = await q
  if (error) return NextResponse.json({ vehicules: [] })

  const lignes = (data ?? []) as { id: string }[]
  const vignettes = new Map<string, string>()
  if (lignes.length) {
    const { data: photos } = await db.from("vehicule_photos")
      .select("vehicule_id,url,principale,ordre")
      .in("vehicule_id", lignes.map(l => l.id)).order("ordre")
    for (const ph of (photos ?? []) as { vehicule_id: string; url: string; principale: boolean }[]) {
      if (ph.principale || !vignettes.has(ph.vehicule_id)) vignettes.set(ph.vehicule_id, ph.url)
    }
  }

  return NextResponse.json({
    vehicules: (data ?? []).map((v: Record<string, unknown>) => ({
      ...v, cover: vignettes.get(v.id as string) ?? null,
    })),
  })
}
