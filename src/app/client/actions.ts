"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type ActionResult = { ok: true; active?: boolean } | { ok: false; error: string }

/** Ajoute / retire une annonce des favoris de l'utilisateur courant. */
export async function toggleFavorite(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Connectez-vous pour ajouter aux favoris." }

  const { data: existing } = await supabase
    .from("favorites").select("property_id")
    .eq("user_id", user.id).eq("property_id", propertyId).maybeSingle()

  if (existing) {
    const { error } = await supabase.from("favorites").delete()
      .eq("user_id", user.id).eq("property_id", propertyId)
    if (error) { console.error("INAYA-DB-040", error); return { ok: false, error: "Échec." } }
    revalidatePath("/client/favoris")
    return { ok: true, active: false }
  }

  const { error } = await supabase.from("favorites")
    .insert({ user_id: user.id, property_id: propertyId } as never)
  if (error) { console.error("INAYA-DB-041", error); return { ok: false, error: "Échec." } }
  revalidatePath("/client/favoris")
  return { ok: true, active: true }
}

/** Met à jour le profil (nom, prénom, téléphone) de l'utilisateur courant. */
export async function updateProfile(form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }

  const patch = {
    nom: String(form.get("nom") || "").trim() || null,
    prenom: String(form.get("prenom") || "").trim() || null,
    telephone: String(form.get("telephone") || "").trim() || null,
  }
  const { error } = await supabase.from("profiles").update(patch as never).eq("id", user.id)
  if (error) {
    console.error("INAYA-DB-042", error)
    if (error.code === "23505") return { ok: false, error: "Ce numéro est déjà utilisé." }
    return { ok: false, error: "Échec de la mise à jour." }
  }
  revalidatePath("/client/profil")
  return { ok: true }
}
