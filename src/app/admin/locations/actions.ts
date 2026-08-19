"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { accesVehicule } from "@/lib/vehicules-acces"
import { POINTS_INSPECTION, type InspectionInput } from "@/lib/vehicules"

// ============================================================================
// LOCATIONS — suivi d'une réservation jusqu'à la restitution.
//
// Le cycle : reservee → en_cours → terminee, avec annulee et litige comme
// issues possibles. Chaque passage a une conséquence sur le VÉHICULE et sur le
// CALENDRIER ; les traiter séparément mènerait à un véhicule « loué » alors que
// la location est terminée, ou à des dates bloquées pour une réservation
// annulée trois semaines plus tôt.
// ============================================================================

type Res = { ok: true } | { ok: false; error: string }

const SUITES: Record<string, string[]> = {
  reservee: ["en_cours", "annulee"],
  en_cours: ["terminee", "litige"],
  terminee: ["litige"],
  litige: ["terminee"],
  annulee: [],
}

export async function changerStatutLocation(id: string, statut: string): Promise<Res> {
  const db = createAdminClient()
  const { data } = await db.from("locations_vehicule")
    .select("id,vehicule_id,statut,debut,fin").eq("id", id).maybeSingle()
  const loc = data as {
    id: string; vehicule_id: string; statut: string; debut: string; fin: string
  } | null
  if (!loc) return { ok: false, error: "Location introuvable." }

  const acces = await accesVehicule(loc.vehicule_id)
  if (!acces.autorise) return { ok: false, error: "Accès refusé." }

  const permis = SUITES[loc.statut] ?? []
  if (!permis.includes(statut)) {
    return { ok: false, error: `Passage de « ${loc.statut} » à « ${statut} » impossible.` }
  }

  const patch: Record<string, unknown> = { statut, updated_at: new Date().toISOString() }
  if (statut === "terminee") patch.retour_reel = new Date().toISOString()

  const { error } = await db.from("locations_vehicule").update(patch as never).eq("id", id)
  if (error) return { ok: false, error: "Échec du changement de statut." }

  // Le calendrier suit. Une annulation libère les dates ; une location en
  // cours les garde ; une restitution les libère à partir de maintenant.
  if (statut === "annulee" || statut === "terminee") {
    await db.from("vehicule_indisponibilites").delete().eq("location_id", id)
  }

  // Le véhicule reflète l'état réel : c'est ce que voit le catalogue.
  const statutVehicule =
    statut === "en_cours" ? "loue"
    : statut === "terminee" || statut === "annulee" ? "disponible"
    : null
  if (statutVehicule) {
    await db.from("vehicules")
      .update({ statut: statutVehicule, updated_at: new Date().toISOString() } as never)
      .eq("id", loc.vehicule_id)
  }

  revalidatePath("/admin/locations")
  revalidatePath("/loueur/locations")
  return { ok: true }
}

/** Relevés de départ et de retour, saisis au comptoir. */
export async function enregistrerReleve(
  id: string,
  champs: {
    km_depart?: number | null; km_retour?: number | null
    carburant_depart?: string | null; carburant_retour?: string | null
    frais_carburant?: number | null; frais_retard?: number | null
    frais_km_supp?: number | null; penalites?: number | null
    depot_restitue?: number | null; notes?: string | null
  },
): Promise<Res> {
  const db = createAdminClient()
  const { data } = await db.from("locations_vehicule")
    .select("vehicule_id,montant_location").eq("id", id).maybeSingle()
  const loc = data as { vehicule_id: string; montant_location: number } | null
  if (!loc) return { ok: false, error: "Location introuvable." }

  const acces = await accesVehicule(loc.vehicule_id)
  if (!acces.autorise) return { ok: false, error: "Accès refusé." }

  // Le total est RECALCULÉ à chaque relevé : le laisser figé après avoir
  // ajouté des frais de retard donnerait une facture fausse, et personne ne
  // penserait à le corriger à la main.
  //
  // Les frais REMPLACENT le total précédent, ils ne s'y ajoutent pas. Le
  // formulaire envoie l'état complet des quatre postes ; les additionner
  // doublait la facture au second enregistrement — un double clic suffisait.
  const supplements =
    (champs.frais_carburant ?? 0) + (champs.frais_retard ?? 0) +
    (champs.frais_km_supp ?? 0) + (champs.penalites ?? 0)

  const { error } = await db.from("locations_vehicule").update({
    ...champs,
    montant_frais: supplements,
    montant_total: (loc.montant_location ?? 0) + supplements,
    updated_at: new Date().toISOString(),
  } as never).eq("id", id)

  if (error) {
    console.error("INAYA-LOCVH-011", error)
    return { ok: false, error: "Échec de l'enregistrement du relevé." }
  }

  revalidatePath("/admin/locations")
  revalidatePath("/loueur/locations")
  return { ok: true }
}

// ============================================================================
// ÉTAT DES LIEUX — le troisième niveau du modèle.
//
// Une constatation DATÉE, rattachée à la location et non au véhicule : c'est
// ce qui permet de dire dans quel état il était le jour où tel client l'a
// rendu, et de trancher un litige des mois plus tard. La grille est la même au
// départ et au retour ; une grille différente d'un côté et de l'autre rendrait
// la comparaison impossible, c'est-à-dire le constat inutile.
// ============================================================================

export async function enregistrerInspection(
  locationId: string, i: InspectionInput,
): Promise<Res> {
  const db = createAdminClient()
  const { data } = await db.from("locations_vehicule")
    .select("vehicule_id").eq("id", locationId).maybeSingle()
  const loc = data as { vehicule_id: string } | null
  if (!loc) return { ok: false, error: "Location introuvable." }

  const acces = await accesVehicule(loc.vehicule_id)
  if (!acces.autorise) return { ok: false, error: "Accès refusé." }

  // Un seul constat par moment : la contrainte d'unicité de la base refuserait
  // le second avec une erreur illisible. On remplace, ce qui permet de
  // corriger un relevé fait trop vite au comptoir.
  await db.from("vehicule_inspections")
    .delete().eq("location_id", locationId).eq("moment", i.moment)

  const { data: cree, error } = await db.from("vehicule_inspections").insert({
    location_id: locationId,
    vehicule_id: loc.vehicule_id,
    moment: i.moment,
    fait_par: acces.userId,
    kilometrage: i.kilometrage ?? null,
    carburant: i.carburant || null,
    proprete: i.proprete || null,
    observations: i.observations?.trim() || null,
  } as never).select("id").single()

  if (error) {
    console.error("INAYA-INSP-010", error)
    return { ok: false, error: "Échec de l'enregistrement du constat." }
  }

  const inspectionId = (cree as { id: string }).id
  const lignes = POINTS_INSPECTION
    .filter(p => i.points[p.element])
    .map(p => ({
      inspection_id: inspectionId, zone: p.zone,
      element: p.element, etat: i.points[p.element],
    }))

  if (lignes.length) {
    const { error: e2 } = await db.from("inspection_points").insert(lignes as never)
    if (e2) {
      console.error("INAYA-INSP-011", e2)
      return { ok: false, error: "Le constat est enregistré, mais pas le détail des points." }
    }
  }

  // Le kilométrage relevé alimente la location : le ressaisir ailleurs serait
  // une seconde occasion de se tromper.
  if (i.kilometrage != null) {
    await db.from("locations_vehicule").update({
      [i.moment === "depart" ? "km_depart" : "km_retour"]: i.kilometrage,
      [i.moment === "depart" ? "carburant_depart" : "carburant_retour"]: i.carburant || null,
      updated_at: new Date().toISOString(),
    } as never).eq("id", locationId)
  }

  revalidatePath("/admin/locations")
  revalidatePath("/loueur/locations")
  return { ok: true }
}

/** Constats déjà enregistrés pour une location (pour les rouvrir et corriger). */
export async function lireInspections(locationId: string) {
  const db = createAdminClient()
  const { data } = await db.from("vehicule_inspections")
    .select("id,moment,kilometrage,carburant,proprete,observations,fait_le")
    .eq("location_id", locationId)
  const inspections = (data ?? []) as {
    id: string; moment: string; kilometrage: number | null
    carburant: string | null; proprete: string | null
    observations: string | null; fait_le: string
  }[]
  if (inspections.length === 0) return []

  const { data: pts } = await db.from("inspection_points")
    .select("inspection_id,element,etat")
    .in("inspection_id", inspections.map(x => x.id))
  const parInspection = new Map<string, Record<string, string>>()
  for (const p of (pts ?? []) as { inspection_id: string; element: string; etat: string }[]) {
    const m = parInspection.get(p.inspection_id) ?? {}
    m[p.element] = p.etat
    parInspection.set(p.inspection_id, m)
  }
  return inspections.map(x => ({ ...x, points: parInspection.get(x.id) ?? {} }))
}
