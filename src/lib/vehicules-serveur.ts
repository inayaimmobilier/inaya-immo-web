import { createAdminClient } from "@/lib/supabase/server"
import { vehiculeVide, type VehiculeInput } from "@/lib/vehicules"

// ============================================================================
// Lectures serveur du module véhicules.
//
// L'administration et l'espace loueur affichent les mêmes fiches ; seule la
// portée change (toute la flotte / la sienne). Écrire la lecture deux fois
// aurait fait diverger les colonnes chargées, et donc l'écran d'édition selon
// l'endroit d'où on l'ouvre.
// ============================================================================

export interface VehiculeListe {
  id: string
  reference: number | null
  loueur_id: string
  marque: string
  modele: string
  type_vehicule: string
  immatriculation: string | null
  statut: string
  publie: boolean
  prix_jour: number | null
  ville: string | null
  photo: string | null
  loueur_nom: string
}

/** Fiches d'une flotte, ou de toutes si `loueurId` est absent. */
export async function listerVehicules(loueurId?: string | null): Promise<VehiculeListe[]> {
  const db = createAdminClient()
  let q = db.from("vehicules")
    .select("id,reference,loueur_id,marque,modele,type_vehicule,immatriculation," +
            "statut,publie,prix_jour,ville")
    .order("created_at", { ascending: false })
  if (loueurId) q = q.eq("loueur_id", loueurId)

  const { data, error } = await q
  if (error) return []
  const lignes = (data ?? []) as Omit<VehiculeListe, "photo" | "loueur_nom">[]
  if (lignes.length === 0) return []

  // Vignettes et noms de loueurs en DEUX requêtes, pas une par ligne : une
  // flotte de cinquante véhicules ferait autant d'allers-retours.
  const ids = lignes.map(l => l.id)
  const { data: photos } = await db.from("vehicule_photos")
    .select("vehicule_id,url,principale,ordre").in("vehicule_id", ids).order("ordre")
  const vignette = new Map<string, string>()
  for (const p of (photos ?? []) as { vehicule_id: string; url: string; principale: boolean }[]) {
    if (p.principale || !vignette.has(p.vehicule_id)) vignette.set(p.vehicule_id, p.url)
  }

  const loueurIds = [...new Set(lignes.map(l => l.loueur_id))]
  const { data: loueurs } = await db.from("loueurs")
    .select("id,raison_sociale,nom_contact").in("id", loueurIds)
  const nom = new Map<string, string>()
  for (const l of (loueurs ?? []) as { id: string; raison_sociale: string | null; nom_contact: string | null }[]) {
    nom.set(l.id, l.raison_sociale || l.nom_contact || "Loueur")
  }

  return lignes.map(l => ({
    ...l,
    photo: vignette.get(l.id) ?? null,
    loueur_nom: nom.get(l.loueur_id) ?? "—",
  }))
}

/** Fiche complète, prête pour le formulaire. `null` si elle n'existe pas. */
export async function chargerVehicule(id: string): Promise<VehiculeInput | null> {
  const db = createAdminClient()
  const { data } = await db.from("vehicules").select("*").eq("id", id).maybeSingle()
  if (!data) return null
  const v = data as Record<string, unknown>

  const [eq, tarifs, frais, photos, docs] = await Promise.all([
    db.from("vehicule_equipements").select("equipement").eq("vehicule_id", id),
    db.from("vehicule_tarifs").select("jour_min,jour_max,prix_jour").eq("vehicule_id", id).order("jour_min"),
    db.from("vehicule_frais").select("code,libelle,montant,unite").eq("vehicule_id", id),
    db.from("vehicule_photos").select("url,emplacement,principale,ordre").eq("vehicule_id", id).order("ordre"),
    db.from("vehicule_documents").select("type,numero,date_emission,date_expiration,fichier_url").eq("vehicule_id", id),
  ])

  const base = vehiculeVide()
  const txt = (k: string) => (v[k] as string | null) ?? ""
  const num = (k: string) => (v[k] as number | null) ?? null

  return {
    ...base,
    loueur_id: v.loueur_id as string,
    agence_id: (v.agence_id as string | null) ?? null,
    statut: v.statut as string,
    publie: !!v.publie,
    type_vehicule: v.type_vehicule as string,
    marque: v.marque as string,
    modele: v.modele as string,
    finition: txt("finition"),
    annee_fabrication: num("annee_fabrication"),
    annee_circulation: num("annee_circulation"),
    couleur: txt("couleur"),
    immatriculation: txt("immatriculation"),
    vin: txt("vin"),
    numero_serie: txt("numero_serie"),
    kilometrage: num("kilometrage"),
    date_acquisition: txt("date_acquisition"),
    description: txt("description"),
    carburant: txt("carburant") || "essence",
    cylindree: num("cylindree"),
    puissance_ch: num("puissance_ch"),
    nb_cylindres: num("nb_cylindres"),
    boite: txt("boite") || "manuelle",
    nb_rapports: num("nb_rapports"),
    transmission: txt("transmission") || "4x2",
    consommation: num("consommation"),
    nb_places: num("nb_places"),
    nb_portes: num("nb_portes"),
    volume_coffre: num("volume_coffre"),
    capacite_reservoir: num("capacite_reservoir"),
    charge_utile: num("charge_utile"),
    prix_heure: num("prix_heure"),
    prix_jour: num("prix_jour"),
    prix_semaine: num("prix_semaine"),
    prix_mois: num("prix_mois"),
    km_inclus_jour: num("km_inclus_jour"),
    km_inclus_semaine: num("km_inclus_semaine"),
    km_inclus_mois: num("km_inclus_mois"),
    prix_km_supp: num("prix_km_supp"),
    depot_garantie: num("depot_garantie"),
    franchise: num("franchise"),
    age_min_conducteur: num("age_min_conducteur"),
    anciennete_permis: num("anciennete_permis"),
    nb_conducteurs_max: num("nb_conducteurs_max"),
    sortie_territoire: !!v.sortie_territoire,
    sortie_ville: !!v.sortie_ville,
    transport_marchandises: !!v.transport_marchandises,
    animaux_autorises: !!v.animaux_autorises,
    fumeur_autorise: !!v.fumeur_autorise,
    usage_commercial: !!v.usage_commercial,
    ville: txt("ville"),
    quartier: txt("quartier"),
    adresse: txt("adresse"),
    video_url: txt("video_url"),
    notes_internes: txt("notes_internes"),
    equipements: ((eq.data ?? []) as { equipement: string }[]).map(x => x.equipement),
    tarifs: (tarifs.data ?? []) as VehiculeInput["tarifs"],
    frais: (frais.data ?? []) as VehiculeInput["frais"],
    photos: ((photos.data ?? []) as { url: string; emplacement: string | null; principale: boolean }[])
      .map(p => ({ url: p.url, emplacement: p.emplacement ?? "", principale: p.principale })),
    documents: ((docs.data ?? []) as {
      type: string; numero: string | null; date_emission: string | null
      date_expiration: string | null; fichier_url: string | null
    }[]).map(d => ({
      type: d.type, numero: d.numero ?? "",
      date_emission: d.date_emission ?? "", date_expiration: d.date_expiration ?? "",
      fichier_url: d.fichier_url ?? "",
    })),
  }
}

export async function listerEquipements() {
  const db = createAdminClient()
  const { data } = await db.from("equipements_vehicule")
    .select("code,libelle,categorie").eq("actif", true).order("categorie").order("ordre")
  return (data ?? []) as { code: string; libelle: string; categorie: string }[]
}

export async function listerLoueursActifs() {
  const db = createAdminClient()
  const { data } = await db.from("loueurs")
    .select("id,raison_sociale,nom_contact").eq("statut", "actif").order("created_at")
  return ((data ?? []) as { id: string; raison_sociale: string | null; nom_contact: string | null }[])
    .map(l => ({ id: l.id, nom: l.raison_sociale || l.nom_contact || "Loueur" }))
}

/** Le loueur (actif) rattaché à un compte, ou null. */
export async function loueurDeProfil(profileId: string) {
  const db = createAdminClient()
  const { data } = await db.from("loueurs")
    .select("id,raison_sociale,nom_contact,statut").eq("profile_id", profileId).maybeSingle()
  return data as {
    id: string; raison_sociale: string | null; nom_contact: string | null; statut: string
  } | null
}

export interface LocationLigneServeur {
  id: string
  reference: number | null
  vehicule: string
  immatriculation: string | null
  client_nom: string
  client_telephone: string
  debut: string
  fin: string
  statut: string
  montant_total: number
  depot_garantie: number
  avec_chauffeur: boolean
  km_depart: number | null
  km_retour: number | null
  loueur_nom: string
}

/** Locations d'une flotte, ou de toutes si `loueurId` est absent. */
export async function listerLocations(loueurId?: string | null): Promise<LocationLigneServeur[]> {
  const db = createAdminClient()
  let q = db.from("locations_vehicule")
    .select("id,reference,vehicule_id,loueur_id,client_nom,client_telephone,debut,fin," +
            "statut,montant_total,depot_garantie,avec_chauffeur,km_depart,km_retour")
    .order("debut", { ascending: false })
  if (loueurId) q = q.eq("loueur_id", loueurId)

  const { data, error } = await q
  if (error) return []
  const lignes = (data ?? []) as (Omit<LocationLigneServeur, "vehicule" | "immatriculation" | "loueur_nom">
    & { vehicule_id: string; loueur_id: string })[]
  if (lignes.length === 0) return []

  // Véhicules et loueurs en deux requêtes : une par ligne rendrait la page
  // inutilisable dès la centième location.
  const { data: vs } = await db.from("vehicules")
    .select("id,marque,modele,immatriculation")
    .in("id", [...new Set(lignes.map(l => l.vehicule_id))])
  const veh = new Map<string, { nom: string; immat: string | null }>()
  for (const v of (vs ?? []) as { id: string; marque: string; modele: string; immatriculation: string | null }[]) {
    veh.set(v.id, { nom: `${v.marque} ${v.modele}`, immat: v.immatriculation })
  }

  const { data: ls } = await db.from("loueurs")
    .select("id,raison_sociale,nom_contact")
    .in("id", [...new Set(lignes.map(l => l.loueur_id))])
  const nomLoueur = new Map<string, string>()
  for (const l of (ls ?? []) as { id: string; raison_sociale: string | null; nom_contact: string | null }[]) {
    nomLoueur.set(l.id, l.raison_sociale || l.nom_contact || "Loueur")
  }

  return lignes.map(l => ({
    id: l.id, reference: l.reference,
    vehicule: veh.get(l.vehicule_id)?.nom ?? "Véhicule",
    immatriculation: veh.get(l.vehicule_id)?.immat ?? null,
    client_nom: l.client_nom, client_telephone: l.client_telephone,
    debut: l.debut, fin: l.fin, statut: l.statut,
    montant_total: l.montant_total ?? 0, depot_garantie: l.depot_garantie ?? 0,
    avec_chauffeur: !!l.avec_chauffeur,
    km_depart: l.km_depart, km_retour: l.km_retour,
    loueur_nom: nomLoueur.get(l.loueur_id) ?? "—",
  }))
}
