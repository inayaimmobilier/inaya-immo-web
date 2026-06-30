"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { notifyClientDecision } from "@/lib/notifications"

// Décision du propriétaire sur un rendez-vous, via le lien tokenisé reçu par
// WhatsApp. Le token fait office d'autorisation (capability) — pas de login.
async function decide(token: string, confirme: boolean): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("leads")
    .select("id, contact_telephone, validation_proprietaire, properties(titre)")
    .eq("validation_token", token)
    .maybeSingle()

  const lead = data as {
    id: string; contact_telephone: string | null; validation_proprietaire: string
    properties: { titre: string } | { titre: string }[] | null
  } | null
  if (!lead || lead.validation_proprietaire !== "en_attente") return // introuvable ou déjà décidé

  await admin.from("leads").update({
    validation_proprietaire: confirme ? "confirme" : "refuse",
    validated_proprio_le: new Date().toISOString(),
    ...(confirme ? { statut: "visite_planifiee" } : {}),
  } as never).eq("id", lead.id)

  const prop = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
  try {
    await notifyClientDecision({
      contactTel: lead.contact_telephone,
      propertyTitre: prop?.titre ?? "votre bien",
      confirme,
    })
  } catch (e) {
    console.error("INAYA-NOTIF-021", e)
  }

  revalidatePath(`/rdv/${token}`)
}

export async function confirmerVisite(token: string): Promise<void> { await decide(token, true) }
export async function refuserVisite(token: string): Promise<void> { await decide(token, false) }
