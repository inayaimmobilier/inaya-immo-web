"use server"

import { createAdminClient, createClient } from "@/lib/supabase/server"
import { prixPourDuree, type TarifPalier } from "@/lib/vehicules"
import { notifyStaff, notifyPhone } from "@/lib/notifications"

// ============================================================================
// DEMANDE DE RÉSERVATION depuis le catalogue public.
//
// Elle crée une location au statut « reservee » : c'est une demande, pas un
// contrat. Le loueur ou l'administration confirme ensuite. Passer directement
// en « en_cours » reviendrait à immobiliser un véhicule sur simple formulaire.
//
// Les MONTANTS sont calculés côté serveur à partir des tarifs enregistrés.
// Accepter un prix envoyé par le navigateur laisserait réserver une voiture
// à zéro franc.
// ============================================================================

type Res = { ok: true; reference: number | null } | { ok: false; error: string }

export interface DemandeReservationInput {
  vehicule_id: string
  nom: string
  telephone: string
  email?: string
  debut: string
  fin: string
  avec_chauffeur: boolean
  message?: string
}

const JOUR_MS = 86_400_000

export async function demanderReservation(d: DemandeReservationInput): Promise<Res> {
  const nom = d.nom?.trim() ?? ""
  const tel = d.telephone?.trim() ?? ""
  if (nom.length < 3) return { ok: false, error: "Indiquez votre nom." }
  if (tel.replace(/\D/g, "").length < 8) return { ok: false, error: "Numéro de téléphone incomplet." }
  if (!d.debut || !d.fin) return { ok: false, error: "Choisissez les dates de début et de fin." }

  const debut = new Date(d.debut)
  const fin = new Date(d.fin)
  if (!Number.isFinite(debut.getTime()) || !Number.isFinite(fin.getTime())) {
    return { ok: false, error: "Dates invalides." }
  }
  if (fin <= debut) return { ok: false, error: "La date de retour doit suivre la date de départ." }
  // Une réservation dans le passé est toujours une erreur de saisie ; la
  // laisser passer polluerait le calendrier de disponibilité.
  if (debut.getTime() < Date.now() - JOUR_MS) {
    return { ok: false, error: "La date de départ est déjà passée." }
  }

  const db = createAdminClient()
  const { data: vData } = await db.from("vehicules")
    .select("id,loueur_id,publie,statut,prix_jour,depot_garantie,marque,modele")
    .eq("id", d.vehicule_id).maybeSingle()
  const v = vData as {
    id: string; loueur_id: string; publie: boolean; statut: string
    prix_jour: number | null; depot_garantie: number | null
    marque: string; modele: string
  } | null
  if (!v || !v.publie || v.statut === "archive") {
    return { ok: false, error: "Ce véhicule n'est plus proposé à la location." }
  }

  // Chevauchement avec une période déjà bloquée : mieux vaut le dire tout de
  // suite que de faire espérer puis rappeler pour annuler.
  const { data: occupe } = await db.from("vehicule_indisponibilites")
    .select("id").eq("vehicule_id", v.id)
    .lt("debut", fin.toISOString()).gt("fin", debut.toISOString()).limit(1)
  if ((occupe ?? []).length > 0) {
    return { ok: false, error: "Le véhicule est déjà pris sur cette période. Essayez d'autres dates." }
  }

  const { data: tarifsData } = await db.from("vehicule_tarifs")
    .select("jour_min,jour_max,prix_jour").eq("vehicule_id", v.id)
  const tarifs = (tarifsData ?? []) as TarifPalier[]

  const jours = Math.max(1, Math.ceil((fin.getTime() - debut.getTime()) / JOUR_MS))
  const prixJour = prixPourDuree(jours, tarifs, v.prix_jour)
  const montant = prixJour ? prixJour * jours : 0

  const { data: loueur } = await db.from("loueurs")
    .select("commission_pourcent").eq("id", v.loueur_id).maybeSingle()
  const commission = (loueur as { commission_pourcent: number } | null)?.commission_pourcent ?? 0

  // Le client peut être connecté ou non : une réservation ne doit pas exiger
  // un compte, mais quand il en a un on la rattache pour qu'il la retrouve.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await db.from("locations_vehicule").insert({
    vehicule_id: v.id,
    loueur_id: v.loueur_id,
    client_id: user?.id ?? null,
    client_nom: nom,
    client_telephone: tel,
    client_email: d.email?.trim() || null,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
    statut: "reservee",
    prix_jour_applique: prixJour,
    montant_location: montant,
    montant_total: montant,
    depot_garantie: v.depot_garantie ?? 0,
    commission_pourcent: commission,
    commission_montant: Math.round(montant * commission / 100),
    avec_chauffeur: !!d.avec_chauffeur,
    notes: d.message?.trim() || null,
  } as never).select("id,reference").single()

  if (error) {
    console.error("INAYA-LOCVH-010", error)
    return { ok: false, error: "Échec de l'enregistrement de la demande. Réessayez." }
  }

  const loc = data as { id: string; reference: number | null }
  const veh = v

  // Le calendrier est bloqué DÈS la demande. Une réservation qui n'immobilise
  // rien laisserait accepter deux clients sur les mêmes dates ; si la demande
  // est refusée, la ligne disparaît avec la location.
  await db.from("vehicule_indisponibilites").insert({
    vehicule_id: v.id, debut: debut.toISOString(), fin: fin.toISOString(),
    motif: "reservation", location_id: loc.id,
  } as never)

  // ── PRÉVENIR ───────────────────────────────────────────────────────────
  //
  // Une demande que personne ne voit est un client perdu. Le staff est
  // prévenu par ses canaux habituels, le client reçoit une confirmation :
  // sans accusé de réception, il rappelle ou réserve ailleurs.
  //
  // Best-effort : un envoi qui échoue ne doit PAS annuler une réservation
  // déjà enregistrée — le client, lui, a bien fait sa demande.
  const titre = `${veh.marque} ${veh.modele}`
  const periode = `${debut.toLocaleDateString("fr-FR")} au ${fin.toLocaleDateString("fr-FR")}`
  await notifyStaff({
    type: "location_vehicule",
    titre: `Demande de location — ${titre}`,
    contenu: `${nom} (${tel}) demande ${titre} du ${periode}`
      + (montant ? ` · ${montant.toLocaleString("fr-FR")} FCFA` : ""),
    payload: { location_id: loc.id, vehicule_id: v.id, reference: loc.reference },
  }).catch(e => console.error("INAYA-LOCVH-012", (e as Error).message))

  await notifyPhone({
    telephone: tel,
    type: "location_vehicule_recue",
    titre: "Demande reçue",
    contenu: `Votre demande pour ${titre} du ${periode} est enregistrée`
      + (loc.reference ? ` (n° ${loc.reference})` : "")
      + `. Nous vous rappelons pour confirmer la disponibilité.`,
    payload: { location_id: loc.id },
  }).catch(e => console.error("INAYA-LOCVH-013", (e as Error).message))

  return { ok: true, reference: loc.reference }
}
