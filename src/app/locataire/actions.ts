"use server"

import { createClient, createAdminClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/** Le locataire signale une réparation → crée un « travaux » à l'état demandé. */
export async function requestRepair(input: { propertyId: string | null; proprietaireId: string | null; titre: string; description: string }): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const titre = input.titre.trim()
  if (!titre) return { ok: false, error: "Décrivez le problème en une ligne." }

  const admin = createAdminClient()
  const { error } = await admin.from("travaux").insert({
    property_id: input.propertyId,
    proprietaire_id: input.proprietaireId,
    demande_par: user.id,
    titre,
    description: input.description.trim() || null,
    statut: "demande",
  } as never)
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01")
      return { ok: false, error: "Fonction indisponible pour le moment." }
    console.error("INAYA-GEST-020", error.message)
    return { ok: false, error: "Échec de l'envoi. Réessayez." }
  }
  return { ok: true }
}
