"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/** Vrai si l'utilisateur connecté est bien un publieur de cette annonce. */
async function isOwner(admin: ReturnType<typeof createAdminClient>, propertyId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("property_publishers")
    .select("id").eq("property_id", propertyId).eq("publisher_id", userId).maybeSingle()
  return !!data
}

/**
 * Modification d'une annonce par son propriétaire (publieur). Repasse l'annonce
 * en vérification (« en attente ») après modification — cohérent avec la
 * promesse « annonces vérifiées » : un changement de prix/description doit être
 * revu avant de rester visible publiquement.
 */
export async function updateMyProperty(propertyId: string, _prev: unknown, form: FormData): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Session expirée. Reconnectez-vous." }

  const admin = createAdminClient()
  if (!(await isOwner(admin, propertyId, user.id))) return { error: "Cette annonce ne vous appartient pas." }

  const titre = (form.get("titre") as string)?.trim()
  const description = (form.get("description") as string | null)?.trim() || null
  const type_offre = form.get("type_offre") as string
  const categorie = form.get("categorie") as string
  const prix = Number(form.get("prix"))
  const quartier = (form.get("quartier") as string | null)?.trim() || null
  const ville = (form.get("ville") as string | null)?.trim() || "Bouaké"
  const numOrNull = (v: FormDataEntryValue | null) => { const n = Number(v); return v && !isNaN(n) ? n : null }
  const mois_caution = type_offre === "location" ? numOrNull(form.get("mois_caution")) : null
  const mois_avance  = type_offre === "location" ? numOrNull(form.get("mois_avance"))  : null
  const mois_agence  = type_offre === "location" ? numOrNull(form.get("mois_agence"))  : null
  const cout_cession = type_offre === "cession" ? numOrNull(form.get("cout_cession")) : null
  const loyer_cession = type_offre === "cession" ? numOrNull(form.get("loyer_cession")) : null
  const conditions_acquisition = type_offre === "cession"
    ? ((form.get("conditions_acquisition") as string | null)?.trim() || null) : null

  if (!titre || !type_offre || !categorie || isNaN(prix) || prix <= 0) {
    return { error: "Veuillez remplir tous les champs obligatoires." }
  }

  const payload: Record<string, unknown> = {
    titre, description, type_offre, categorie, prix, quartier, ville,
    mois_caution, mois_avance, mois_agence,
    cout_cession, loyer_cession, conditions_acquisition,
    // Toute modification repasse l'annonce en vérification avant republication.
    statut: "en_attente_validation",
  }

  let { error } = await admin.from("properties").update(payload as never).eq("id", propertyId)
  if (error?.code === "42703") {
    const { mois_caution: _mc, mois_avance: _ma, mois_agence: _mg, cout_cession: _cc, loyer_cession: _lc, conditions_acquisition: _ca, ...base } = payload
    const retry = await admin.from("properties").update(base as never).eq("id", propertyId)
    error = retry.error
  }
  if (error) { console.error("INAYA-OWNER-EDIT-001", error.message); return { error: "Échec de l'enregistrement. Réessayez." } }

  revalidatePath(`/proprietaire/biens/${propertyId}`)
  revalidatePath("/proprietaire/biens")
  return { ok: true }
}

/**
 * Suppression d'une annonce par son propriétaire. Mêmes garde-fous que la
 * suppression admin : refusée si des transactions financières y sont liées.
 */
export async function deleteMyProperty(propertyId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." }

  const admin = createAdminClient()
  if (!(await isOwner(admin, propertyId, user.id))) return { ok: false, error: "Cette annonce ne vous appartient pas." }

  const { count } = await admin
    .from("transactions").select("id", { count: "exact", head: true }).eq("property_id", propertyId)
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Une transaction est liée à cette annonce. Contactez le support pour la retirer." }
  }

  await admin.from("moderation_logs").delete().eq("property_id", propertyId)
  await admin.from("leads").delete().eq("property_id", propertyId)

  const { error } = await admin.from("properties").delete().eq("id", propertyId)
  if (error) {
    console.error("INAYA-OWNER-DEL-001", error.message)
    return { ok: false, error: "Échec de la suppression. Réessayez." }
  }

  revalidatePath("/proprietaire/biens")
  return { ok: true }
}
