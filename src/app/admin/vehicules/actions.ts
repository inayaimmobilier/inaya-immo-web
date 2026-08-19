"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import type { VehiculeInput } from "@/lib/vehicules"

// ============================================================================
// VÉHICULES — création, modification, suppression.
//
// Les mêmes actions servent à l'administration ET à l'espace loueur : dupliquer
// la logique aurait fait diverger les contrôles, et c'est précisément là qu'un
// loueur finirait par modifier la flotte d'un autre.
//
// L'autorisation est donc calculée une seule fois, par `acces()` :
//   - un admin passe partout ;
//   - un loueur ne passe que sur SES véhicules, et seulement s'il est actif.
// La comparaison se fait sur `loueur_id` lu EN BASE, jamais sur celui envoyé
// par le formulaire — sans quoi il suffirait de changer un champ caché.
// ============================================================================

type Res = { ok: true; id?: string } | { ok: false; error: string }

interface Acces {
  admin: boolean
  loueurId: string | null
}

async function acces(): Promise<Acces> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { admin: false, loueurId: null }

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role === "super_admin" || role === "admin") return { admin: true, loueurId: null }

  const db = createAdminClient()
  const { data: l } = await db.from("loueurs")
    .select("id").eq("profile_id", user.id).eq("statut", "actif").maybeSingle()
  return { admin: false, loueurId: (l as { id: string } | null)?.id ?? null }
}

/** Ce compte peut-il agir sur ce loueur ? */
function autorise(a: Acces, loueurId: string | null): boolean {
  if (a.admin) return true
  return !!a.loueurId && !!loueurId && a.loueurId === loueurId
}

const nombre = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const texte = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s === "" ? null : s
}

/** Colonnes de la table `vehicules`, nettoyées. */
function colonnes(i: VehiculeInput): Record<string, unknown> {
  return {
    loueur_id: i.loueur_id,
    agence_id: i.agence_id || null,
    statut: i.statut,
    publie: !!i.publie,
    type_vehicule: i.type_vehicule,
    marque: i.marque.trim(),
    modele: i.modele.trim(),
    finition: texte(i.finition),
    annee_fabrication: nombre(i.annee_fabrication),
    annee_circulation: nombre(i.annee_circulation),
    couleur: texte(i.couleur),
    immatriculation: texte(i.immatriculation)?.toUpperCase() ?? null,
    vin: texte(i.vin)?.toUpperCase() ?? null,
    numero_serie: texte(i.numero_serie),
    kilometrage: nombre(i.kilometrage),
    date_acquisition: i.date_acquisition || null,
    description: texte(i.description),
    carburant: texte(i.carburant),
    cylindree: nombre(i.cylindree),
    puissance_ch: nombre(i.puissance_ch),
    nb_cylindres: nombre(i.nb_cylindres),
    boite: texte(i.boite),
    nb_rapports: nombre(i.nb_rapports),
    transmission: texte(i.transmission),
    consommation: nombre(i.consommation),
    nb_places: nombre(i.nb_places),
    nb_portes: nombre(i.nb_portes),
    volume_coffre: nombre(i.volume_coffre),
    capacite_reservoir: nombre(i.capacite_reservoir),
    charge_utile: nombre(i.charge_utile),
    prix_heure: nombre(i.prix_heure),
    prix_jour: nombre(i.prix_jour),
    prix_semaine: nombre(i.prix_semaine),
    prix_mois: nombre(i.prix_mois),
    km_inclus_jour: nombre(i.km_inclus_jour),
    km_inclus_semaine: nombre(i.km_inclus_semaine),
    km_inclus_mois: nombre(i.km_inclus_mois),
    prix_km_supp: nombre(i.prix_km_supp),
    depot_garantie: nombre(i.depot_garantie),
    franchise: nombre(i.franchise),
    age_min_conducteur: nombre(i.age_min_conducteur),
    anciennete_permis: nombre(i.anciennete_permis),
    nb_conducteurs_max: nombre(i.nb_conducteurs_max),
    sortie_territoire: !!i.sortie_territoire,
    sortie_ville: !!i.sortie_ville,
    transport_marchandises: !!i.transport_marchandises,
    animaux_autorises: !!i.animaux_autorises,
    fumeur_autorise: !!i.fumeur_autorise,
    usage_commercial: !!i.usage_commercial,
    ville: texte(i.ville),
    quartier: texte(i.quartier),
    adresse: texte(i.adresse),
    video_url: texte(i.video_url),
    notes_internes: texte(i.notes_internes),
  }
}

function valider(i: VehiculeInput): string | null {
  if (!i.loueur_id) return "Choisissez le propriétaire du véhicule."
  if (!i.marque?.trim()) return "La marque est obligatoire."
  if (!i.modele?.trim()) return "Le modèle est obligatoire."

  // Publier sans prix ni photo produit une annonce que personne ne peut
  // exploiter : on refuse à la publication, pas à l'enregistrement, pour ne pas
  // empêcher de saisir une fiche en plusieurs fois.
  if (i.publie) {
    const aUnPrix = [i.prix_jour, i.prix_semaine, i.prix_mois, i.prix_heure]
      .some(p => nombre(p) && nombre(p)! > 0) || i.tarifs.length > 0
    if (!aUnPrix) return "Impossible de publier sans aucun tarif."
    if (i.photos.length === 0) return "Impossible de publier sans photo."
  }

  // Deux paliers qui se chevauchent donnent deux prix pour la même durée : le
  // client verrait l'un, la facture porterait l'autre.
  const tries = [...i.tarifs].sort((a, b) => a.jour_min - b.jour_min)
  for (let k = 1; k < tries.length; k++) {
    const prec = tries[k - 1]
    if (prec.jour_max == null || tries[k].jour_min <= prec.jour_max) {
      return `Les paliers de tarif se chevauchent à partir de ${tries[k].jour_min} jour(s).`
    }
  }
  return null
}

/**
 * Réécrit les lignes filles d'un véhicule (remplacement complet).
 *
 * Renvoie le premier échec rencontré. Sans cela, un code d'équipement
 * inconnu faisait échouer l'insertion APRÈS la suppression : le véhicule
 * perdait ses tarifs et ses photos, et l'écran annonçait « enregistré ».
 */
async function enregistrerFilles(id: string, i: VehiculeInput): Promise<string | null> {
  const db = createAdminClient()

  // Remplacement plutôt que fusion : le formulaire envoie l'état complet
  // voulu, et tenter de deviner ce qui a changé ligne à ligne coûterait plus
  // cher que de tout réécrire — pour un volume de quelques dizaines de lignes.
  await Promise.all([
    db.from("vehicule_equipements").delete().eq("vehicule_id", id),
    db.from("vehicule_tarifs").delete().eq("vehicule_id", id),
    db.from("vehicule_frais").delete().eq("vehicule_id", id),
    db.from("vehicule_photos").delete().eq("vehicule_id", id),
    db.from("vehicule_documents").delete().eq("vehicule_id", id),
  ])

  const echecs: string[] = []
  const noter = (quoi: string, e: { message: string } | null) => {
    if (e) { console.error("INAYA-VEH-020", quoi, e.message); echecs.push(quoi) }
  }

  if (i.equipements.length) {
    const { error } = await db.from("vehicule_equipements").insert(
      i.equipements.map(e => ({ vehicule_id: id, equipement: e })) as never,
    )
    noter("équipements", error)
  }
  if (i.tarifs.length) {
    const { error } = await db.from("vehicule_tarifs").insert(
      i.tarifs.map(t => ({
        vehicule_id: id, jour_min: t.jour_min,
        jour_max: t.jour_max, prix_jour: t.prix_jour,
      })) as never,
    )
    noter("tarifs", error)
  }
  if (i.frais.length) {
    const { error } = await db.from("vehicule_frais").insert(
      i.frais.filter(f => f.code && f.libelle).map(f => ({
        vehicule_id: id, code: f.code, libelle: f.libelle,
        montant: f.montant || 0, unite: f.unite || "forfait",
      })) as never,
    )
    noter("frais", error)
  }
  if (i.photos.length) {
    // Une seule photo principale : l'index unique de la base refuserait la
    // seconde, et l'erreur serait incompréhensible pour l'utilisateur.
    let principaleVue = false
    const { error } = await db.from("vehicule_photos").insert(
      i.photos.filter(p => p.url?.trim()).map((p, rang) => {
        const principale = p.principale && !principaleVue
        if (principale) principaleVue = true
        return {
          vehicule_id: id, url: p.url.trim(),
          emplacement: p.emplacement || null,
          principale, ordre: rang,
        }
      }) as never,
    )
    noter("photos", error)
  }
  if (i.documents.length) {
    const { error } = await db.from("vehicule_documents").insert(
      i.documents.filter(d => d.type).map(d => ({
        vehicule_id: id, type: d.type,
        numero: d.numero?.trim() || null,
        date_emission: d.date_emission || null,
        date_expiration: d.date_expiration || null,
        fichier_url: d.fichier_url?.trim() || null,
      })) as never,
    )
    noter("documents", error)
  }

  return echecs.length
    ? `Le véhicule est enregistré, mais ces éléments n'ont pas pu l'être : ${echecs.join(", ")}.`
    : null
}

export async function creerVehicule(i: VehiculeInput): Promise<Res> {
  const a = await acces()
  if (!a.admin && !a.loueurId) return { ok: false, error: "Accès refusé." }

  // Un loueur ne crée que pour lui-même, quel que soit le champ envoyé.
  const loueurId = a.admin ? i.loueur_id : a.loueurId!
  const entree = { ...i, loueur_id: loueurId }

  const erreur = valider(entree)
  if (erreur) return { ok: false, error: erreur }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const db = createAdminClient()

  const { data, error } = await db.from("vehicules")
    .insert({ ...colonnes(entree), cree_par: user?.id ?? null } as never)
    .select("id").single()
  if (error) {
    console.error("INAYA-VEH-010", error)
    return { ok: false, error: "Échec de l'enregistrement du véhicule." }
  }

  const id = (data as { id: string }).id
  const partiel = await enregistrerFilles(id, entree)

  revalidatePath("/admin/vehicules")
  revalidatePath("/loueur")
  return partiel ? { ok: false, error: partiel } : { ok: true, id }
}

export async function majVehicule(id: string, i: VehiculeInput): Promise<Res> {
  const a = await acces()
  const db = createAdminClient()

  const { data: existant } = await db.from("vehicules")
    .select("loueur_id").eq("id", id).maybeSingle()
  const proprio = (existant as { loueur_id: string } | null)?.loueur_id ?? null
  if (!proprio) return { ok: false, error: "Véhicule introuvable." }
  if (!autorise(a, proprio)) return { ok: false, error: "Accès refusé." }

  // Un loueur ne peut pas transférer son véhicule à un autre loueur.
  const entree = { ...i, loueur_id: a.admin ? i.loueur_id : proprio }

  const erreur = valider(entree)
  if (erreur) return { ok: false, error: erreur }

  const { error } = await db.from("vehicules")
    .update({ ...colonnes(entree), updated_at: new Date().toISOString() } as never)
    .eq("id", id)
  if (error) {
    console.error("INAYA-VEH-011", error)
    return { ok: false, error: "Échec de l'enregistrement." }
  }

  const partiel = await enregistrerFilles(id, entree)
  revalidatePath("/admin/vehicules")
  revalidatePath("/loueur")
  return partiel ? { ok: false, error: partiel } : { ok: true, id }
}

/**
 * Changement de statut rapide (disponible, maintenance, archivé…), sans
 * repasser par le formulaire complet : c'est le geste le plus fréquent.
 */
export async function changerStatutVehicule(id: string, statut: string): Promise<Res> {
  const a = await acces()
  const db = createAdminClient()
  const { data } = await db.from("vehicules").select("loueur_id").eq("id", id).maybeSingle()
  const proprio = (data as { loueur_id: string } | null)?.loueur_id ?? null
  if (!autorise(a, proprio)) return { ok: false, error: "Accès refusé." }

  const patch: Record<string, unknown> = { statut, updated_at: new Date().toISOString() }
  // Archiver retire du catalogue : laisser publié un véhicule archivé le
  // ferait disparaître de la vue publique tout en le montrant « en ligne »
  // dans l'administration, ce qui est le meilleur moyen de ne pas comprendre.
  if (statut === "archive") patch.publie = false

  const { error } = await db.from("vehicules").update(patch as never).eq("id", id)
  if (error) return { ok: false, error: "Échec du changement de statut." }

  revalidatePath("/admin/vehicules")
  revalidatePath("/loueur")
  return { ok: true }
}

export async function publierVehicule(id: string, publie: boolean): Promise<Res> {
  const a = await acces()
  const db = createAdminClient()
  const { data } = await db.from("vehicules")
    .select("loueur_id, prix_jour, prix_semaine, prix_mois, prix_heure, statut")
    .eq("id", id).maybeSingle()
  const v = data as {
    loueur_id: string; prix_jour: number | null; prix_semaine: number | null
    prix_mois: number | null; prix_heure: number | null; statut: string
  } | null
  if (!v) return { ok: false, error: "Véhicule introuvable." }
  if (!autorise(a, v.loueur_id)) return { ok: false, error: "Accès refusé." }

  if (publie) {
    const { count: nbPhotos } = await db.from("vehicule_photos")
      .select("id", { count: "exact", head: true }).eq("vehicule_id", id)
    const { count: nbTarifs } = await db.from("vehicule_tarifs")
      .select("id", { count: "exact", head: true }).eq("vehicule_id", id)
    const aPrix = [v.prix_jour, v.prix_semaine, v.prix_mois, v.prix_heure]
      .some(p => (p ?? 0) > 0) || (nbTarifs ?? 0) > 0
    if (!aPrix) return { ok: false, error: "Ajoutez un tarif avant de publier." }
    if ((nbPhotos ?? 0) === 0) return { ok: false, error: "Ajoutez au moins une photo avant de publier." }
    if (v.statut === "archive") return { ok: false, error: "Ce véhicule est archivé — changez son statut d'abord." }
  }

  const { error } = await db.from("vehicules")
    .update({ publie, updated_at: new Date().toISOString() } as never).eq("id", id)
  if (error) return { ok: false, error: "Échec de la publication." }

  revalidatePath("/admin/vehicules")
  revalidatePath("/loueur")
  return { ok: true }
}

/**
 * Suppression.
 *
 * Refusée dès qu'une location existe : la clé étrangère est en `restrict`, et
 * c'est voulu — effacer un véhicule effacerait le contexte de contrats signés
 * et des états des lieux qui font foi. Archiver est ce que l'on cherche
 * presque toujours.
 */
export async function supprimerVehicule(id: string): Promise<Res> {
  const a = await acces()
  const db = createAdminClient()
  const { data } = await db.from("vehicules").select("loueur_id").eq("id", id).maybeSingle()
  const proprio = (data as { loueur_id: string } | null)?.loueur_id ?? null
  if (!autorise(a, proprio)) return { ok: false, error: "Accès refusé." }

  const { count } = await db.from("locations_vehicule")
    .select("id", { count: "exact", head: true }).eq("vehicule_id", id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Ce véhicule a ${count} location(s) enregistrée(s). Archivez-le plutôt que de le supprimer.`,
    }
  }

  const { error } = await db.from("vehicules").delete().eq("id", id)
  if (error) {
    console.error("INAYA-VEH-012", error)
    return { ok: false, error: "Échec de la suppression." }
  }
  revalidatePath("/admin/vehicules")
  revalidatePath("/loueur")
  return { ok: true }
}
