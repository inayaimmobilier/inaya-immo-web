"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"

type Res = { ok: true } | { ok: false; error: string }

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: string } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur"].includes(role)) return null
  return { id: user.id, role }
}

export async function addPharmacie(input: {
  nom: string; ville?: string; quartier?: string; adresse?: string; telephone?: string
  date_debut?: string; date_fin?: string
}): Promise<Res> {
  const me = await requireStaff()
  if (!me) return { ok: false, error: "Action réservée au staff." }
  const nom = (input.nom || "").trim()
  if (!nom) return { ok: false, error: "Le nom de la pharmacie est requis." }
  const admin = createAdminClient()
  const { error } = await admin.from("pharmacies_garde").insert({
    nom, ville: (input.ville || "Bouaké").trim(),
    quartier: input.quartier?.trim() || null, adresse: input.adresse?.trim() || null,
    telephone: input.telephone?.trim() || null,
    date_debut: input.date_debut || null, date_fin: input.date_fin || null,
    actif: true, source: "manuel", created_by: me.id,
  } as never)
  if (error) { console.error("INAYA-PHARM-ADD", error.message); return { ok: false, error: "Enregistrement impossible." } }
  revalidatePath("/admin/pharmacies")
  return { ok: true }
}

export async function togglePharmacie(id: string, actif: boolean): Promise<Res> {
  const me = await requireStaff()
  if (!me) return { ok: false, error: "Action réservée au staff." }
  const { error } = await createAdminClient().from("pharmacies_garde").update({ actif } as never).eq("id", id)
  if (error) return { ok: false, error: "Échec." }
  revalidatePath("/admin/pharmacies")
  return { ok: true }
}

export async function removePharmacie(id: string): Promise<Res> {
  const me = await requireStaff()
  if (!me) return { ok: false, error: "Action réservée au staff." }
  const { error } = await createAdminClient().from("pharmacies_garde").delete().eq("id", id)
  if (error) return { ok: false, error: "Suppression impossible." }
  revalidatePath("/admin/pharmacies")
  return { ok: true }
}
