import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// VÉHICULES DE LOCATION ET LOUEURS.
//
// Deux listes qui ne se lisent pas l'une sans l'autre : un véhicule appartient
// à un loueur, et c'est le loueur qu'on appelle quand un client veut réserver.
// On renvoie donc les deux, avec le nombre de véhicules par loueur.
//
// La flotte est petite : pas de pagination, mais des colonnes choisies — la
// table `vehicules` en compte plus de soixante, dont on n'a pas l'usage ici.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLONNES =
  "id,reference,loueur_id,statut,publie,type_vehicule,marque,modele,finition,annee_circulation," +
  "couleur,immatriculation,carburant,boite,nb_places,prix_jour,prix_semaine,prix_mois,ville,quartier,created_at"

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const admin = createAdminClient()

  const [{ data: vehicules, error }, { data: loueurs }, { data: locations }] = await Promise.all([
    admin.from("vehicules").select(COLONNES).neq("statut", "archive").order("created_at", { ascending: false }),
    admin.from("loueurs")
      .select("id,type,raison_sociale,nom_contact,telephone,email,ville,quartier,statut,commission_pourcent,numero_identification")
      .order("raison_sociale"),
    admin.from("locations_vehicule")
      .select("id,vehicule_id,statut,date_debut,date_fin,client_nom,client_telephone,montant_total,created_at")
      .in("statut", ["reservee", "en_cours"]).order("date_debut"),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type V = Record<string, unknown> & { id: string; loueur_id: string | null; publie: boolean | null; statut: string }
  const flotte = (vehicules ?? []) as V[]

  // Photo de couverture : une requête pour toute la flotte.
  const couverture = new Map<string, string>()
  if (flotte.length) {
    // `principale` d'abord : c'est la photo que le loueur a choisie pour la
    // vitrine, et elle ne porte pas forcément l'ordre 0.
    const { data: photos } = await admin.from("vehicule_photos")
      .select("vehicule_id,url,ordre,principale").in("vehicule_id", flotte.map(v => v.id))
      .order("principale", { ascending: false }).order("ordre")
    for (const p of (photos ?? []) as { vehicule_id: string; url: string }[]) {
      if (!couverture.has(p.vehicule_id)) couverture.set(p.vehicule_id, p.url)
    }
  }

  type L = { id: string; raison_sociale: string | null; nom_contact: string | null; statut: string }
  const listeLoueurs = (loueurs ?? []) as unknown as L[]
  const nbParLoueur = new Map<string, number>()
  for (const v of flotte) if (v.loueur_id) nbParLoueur.set(v.loueur_id, (nbParLoueur.get(v.loueur_id) ?? 0) + 1)
  const nomLoueur = new Map(listeLoueurs.map(l => [l.id, l.raison_sociale || l.nom_contact || "Loueur"]))

  const voitNumeros = peut(staff.role, "numeros")

  return NextResponse.json({
    vehicules: flotte.map(v => ({
      ...v,
      publie: v.publie === true,
      loueur: v.loueur_id ? (nomLoueur.get(v.loueur_id) ?? null) : null,
      cover: couverture.get(v.id) ?? null,
    })),
    loueurs: (loueurs ?? []).map(l => {
      const x = l as Record<string, unknown>
      return {
        ...x,
        telephone: voitNumeros ? x.telephone : null,
        vehicules: nbParLoueur.get(String(x.id)) ?? 0,
      }
    }),
    locations: locations ?? [],
    resume: {
      flotte: flotte.length,
      enLigne: flotte.filter(v => v.publie === true).length,
      locationsEnCours: (locations ?? []).filter(l => (l as { statut: string }).statut === "en_cours").length,
      reservations: (locations ?? []).filter(l => (l as { statut: string }).statut === "reservee").length,
      loueurs: listeLoueurs.length,
    },
    droits: { modifier: peut(staff.role, "moderer"), numeros: voitNumeros },
  })
}

/** Publie ou retire un véhicule de la vitrine. */
export async function PATCH(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  let corps: { id?: string; publie?: boolean }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (!corps.id || typeof corps.publie !== "boolean") {
    return NextResponse.json({ error: "id_et_publie_requis" }, { status: 400 })
  }

  const { error } = await createAdminClient().from("vehicules")
    .update({ publie: corps.publie } as never).eq("id", corps.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, publie: corps.publie })
}
