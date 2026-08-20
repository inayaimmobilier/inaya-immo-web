"use server"

import { createClient } from "@/lib/supabase/server"
import {
  creerReservationVehicule,
  type DemandeReservationInput,
  type ResReservation,
} from "@/lib/reservation-vehicule"

// Adaptateur du formulaire public : il n'apporte que la session. Toute la
// règle (chevauchement, tarif, commission, notifications) vit dans la
// bibliothèque partagée avec l'application mobile.
export async function demanderReservation(d: DemandeReservationInput): Promise<ResReservation> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return creerReservationVehicule(d, user?.id ?? null)
}
