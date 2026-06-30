"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { notifyClientDecision } from "@/lib/notifications"
import type { UserRole } from "@/types/database"

type Result = { ok: true } | { ok: false; error: string }

async function staffRole(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role ?? null
  return role && ["super_admin", "admin", "moderateur", "agent"].includes(role) ? role : null
}

/** Confirme ou annule une réservation (lead) et informe le client par WhatsApp. */
async function decideReservation(leadId: string, confirme: boolean): Promise<void> {
  if (!(await staffRole()) || !leadId) return
  const admin = createAdminClient()
  const { data } = await admin
    .from("leads").select("id, contact_telephone, properties(titre)").eq("id", leadId).single()
  const lead = data as { contact_telephone: string | null; properties: { titre: string } | { titre: string }[] | null } | null
  if (!lead) return

  await admin.from("leads").update({
    validation_proprietaire: confirme ? "confirme" : "refuse",
    validated_proprio_le: new Date().toISOString(),
    statut: confirme ? "visite_planifiee" : "abandonne",
  } as never).eq("id", leadId)

  const prop = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
  try {
    await notifyClientDecision({ contactTel: lead.contact_telephone, propertyTitre: prop?.titre ?? "votre réservation", confirme })
  } catch (e) {
    console.error("INAYA-RESA-001", e)
  }
  revalidatePath("/admin/residences")
}

export async function confirmerReservation(formData: FormData): Promise<void> {
  await decideReservation(String(formData.get("lead_id") || ""), true)
}
export async function annulerReservation(formData: FormData): Promise<void> {
  await decideReservation(String(formData.get("lead_id") || ""), false)
}

/** Supprime une résidence (admin). Refuse si des transactions sont liées. */
export async function supprimerResidence(propertyId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) return { ok: false, error: "Suppression réservée aux administrateurs." }

  const admin = createAdminClient()
  const { count } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("property_id", propertyId)
  if ((count ?? 0) > 0) return { ok: false, error: "Des transactions sont liées. Suspendez la résidence plutôt que de la supprimer." }

  await admin.from("moderation_logs").delete().eq("property_id", propertyId)
  await admin.from("leads").delete().eq("property_id", propertyId)
  const { error } = await admin.from("properties").delete().eq("id", propertyId)
  if (error) { console.error("INAYA-RESID-DEL", error); return { ok: false, error: "Échec de la suppression." } }

  revalidatePath("/admin/residences")
  return { ok: true }
}

/** Active / désactive la disponibilité d'une résidence meublée (staff). */
export async function setDisponibilite(propertyId: string, disponible: boolean): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur", "agent"].includes(role)) {
    return { ok: false, error: "Action réservée au staff." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("properties").update({ disponible } as never).eq("id", propertyId)
  if (error) {
    console.error("INAYA-RESID-001", error)
    return { ok: false, error: "Échec de la mise à jour de la disponibilité." }
  }
  revalidatePath("/admin/residences")
  return { ok: true }
}
