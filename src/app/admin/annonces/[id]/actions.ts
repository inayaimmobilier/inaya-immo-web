"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"

async function getCallerRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  return (data as { role: string } | null)?.role ?? null
}

export async function updateProperty(propertyId: string, _prev: unknown, form: FormData) {
  const role = await getCallerRole()
  if (!role || !["super_admin", "admin", "moderateur"].includes(role)) {
    return { error: "Accès refusé" }
  }

  const titre = form.get("titre") as string
  const description = form.get("description") as string | null
  const type_offre = form.get("type_offre") as string
  const categorie = form.get("categorie") as string
  const prix = Number(form.get("prix"))
  const prix_m2 = form.get("prix_m2") !== null && form.get("prix_m2") !== "" ? Number(form.get("prix_m2")) || null : null
  const quartier = (form.get("quartier") as string) || null
  const ville = form.get("ville") as string
  const mois_caution = form.get("mois_caution") !== "" ? Number(form.get("mois_caution")) || null : null
  const mois_avance  = form.get("mois_avance")  !== "" ? Number(form.get("mois_avance"))  || null : null
  const mois_agence  = form.get("mois_agence")  !== "" ? Number(form.get("mois_agence"))  || null : null
  const cout_cession  = form.get("cout_cession")  !== "" ? Number(form.get("cout_cession"))  || null : null
  const loyer_cession = form.get("loyer_cession") !== "" ? Number(form.get("loyer_cession")) || null : null
  const conditions_acquisition = (form.get("conditions_acquisition") as string)?.trim() || null
  const tarif_periode = (form.get("tarif_periode") as string | null)?.trim() || null
  const forfaits = (form.get("forfaits") as string | null)?.trim() || null

  if (!titre?.trim() || !type_offre || !categorie || isNaN(prix)) {
    return { error: "Champs obligatoires manquants" }
  }

  const admin = createAdminClient()
  const payload: Record<string, unknown> = {
    titre: titre.trim(),
    description: description?.trim() || null,
    type_offre,
    categorie,
    prix,
    prix_m2,
    quartier: quartier?.trim() || null,
    ville: ville?.trim() || "Bouaké",
    mois_caution,
    mois_avance,
    mois_agence,
    cout_cession,
    loyer_cession,
    conditions_acquisition,
    tarif_periode,
    forfaits,
  }

  let { error } = await admin.from("properties").update(payload as never).eq("id", propertyId)

  // 42703 = colonne absente (migrations récentes non appliquées) → réessai sans les colonnes récentes
  if (error?.code === "42703") {
    const { prix_m2: _pm, cout_cession: _cc, loyer_cession: _lc, conditions_acquisition: _ca, tarif_periode: _tp, forfaits: _f, ...base } = payload
    const retry = await admin.from("properties").update(base as never).eq("id", propertyId)
    error = retry.error
  }

  if (error) return { error: error.message }
  revalidatePath(`/admin/annonces/${propertyId}`)
  return { ok: true }
}

export async function changeStatut(propertyId: string, statut: string) {
  const role = await getCallerRole()
  if (!role || !["super_admin", "admin", "moderateur"].includes(role)) {
    return { error: "Accès refusé" }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("properties").update({ statut } as never).eq("id", propertyId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/annonces/${propertyId}`)
  return { ok: true }
}

/**
 * Suppression d'une annonce (réservée admin/super_admin).
 * Refuse si des transactions financières sont liées (on suspend alors plutôt).
 * Sinon nettoie les dépendances sans cascade (logs de modération, leads) puis
 * supprime l'annonce — médias, publieurs et favoris cascadent automatiquement.
 */
export async function deleteProperty(propertyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getCallerRole()
  if (!role || !["super_admin", "admin"].includes(role)) {
    return { ok: false, error: "Suppression réservée aux administrateurs." }
  }

  const admin = createAdminClient()

  // Garde-fou : ne jamais supprimer une annonce liée à des transactions (données financières).
  const { count } = await admin
    .from("transactions").select("id", { count: "exact", head: true }).eq("property_id", propertyId)
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Des transactions sont liées à cette annonce. Suspendez-la plutôt que de la supprimer." }
  }

  // Dépendances sans ON DELETE CASCADE
  await admin.from("moderation_logs").delete().eq("property_id", propertyId)
  await admin.from("leads").delete().eq("property_id", propertyId)

  const { error } = await admin.from("properties").delete().eq("id", propertyId)
  if (error) {
    console.error("INAYA-PROP-DEL-001", error)
    return { ok: false, error: "Échec de la suppression. Des données liées subsistent peut-être." }
  }

  revalidatePath("/admin/annonces")
  return { ok: true }
}
