"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { notifyClientDecision } from "@/lib/notifications"

// Décision du propriétaire sur un rendez-vous, via le lien tokenisé reçu par
// WhatsApp. Le token fait office d'autorisation (capability) — pas de login.
async function decide(token: string, confirme: boolean): Promise<void> {
  // SÉCURITÉ : token issu de l'URL (non fiable). UUID strict exigé avant toute
  // requête — sinon un token forgé injecterait un filtre PostgREST via le .or().
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return
  const admin = createAdminClient()
  const sel = "id, contact_telephone, validation_proprietaire, properties(titre)"
  // Résout par ID (nouveaux liens) OU validation_token (liens déjà envoyés).
  let { data } = await admin.from("leads").select(sel)
    .or(`id.eq.${token},validation_token.eq.${token}`).maybeSingle()
  if (!data) {
    const byId = await admin.from("leads").select(sel).eq("id", token).maybeSingle()
    data = byId.data
  }

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
