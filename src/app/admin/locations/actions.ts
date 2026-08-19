"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { accesVehicule } from "@/lib/vehicules-acces"

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
