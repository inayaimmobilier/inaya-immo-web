"use server"

import { createClient, createAdminClient } from "@/lib/supabase/server"
import { runMatchingForRequest } from "@/lib/matching"
import { computeAlerteExpiry } from "@/lib/alert-expiry"
import { normalizeSearchCategories, withSousTypesNote } from "@/lib/search-cats"
import type { PropertyCat, PropertyType } from "@/types/database"

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "").trim()
  if (cleaned.replace(/\D/g, "").length < 8) return null
  return cleaned
}

export async function saveSearchFull(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const type      = (form.get("type") as string) || null
  const categorie = (form.get("categorie") as string) || null
  const quartier  = (form.get("quartier") as string) || null
  const prix_min  = form.get("prix_min") ? Number(form.get("prix_min")) : null
  const prix_max  = form.get("prix_max") ? Number(form.get("prix_max")) : null
  const pieces_min = form.get("pieces_min") ? Number(form.get("pieces_min")) : null
  const q         = (form.get("q") as string) || null

  // Types admin (« villa », « entrepôt »…) → familles enum de la base (la colonne
  // categories est un enum : insérer un sous-type inconnu ferait échouer la
  // création). Le sous-type précis est consigné dans les précisions.
  const { cats, sousTypes } = normalizeSearchCategories(categorie ? [categorie] : [])

  const criteres = {
    canal:            "web" as const,
    type_offre:       type as PropertyType | null,
    categories:       cats.length ? (cats as PropertyCat[]) : null,
    zones:            quartier ? [quartier] : null,
    budget_min:       prix_min,
    budget_max:       prix_max,
    nb_pieces_min:    pieces_min,
    description_libre: withSousTypesNote(q, sousTypes),
    statut:           "active" as const,
  }

  let requestId: string

  if (user) {
    // Durée de vie : permanente pour un client final, limitée (TTL admin, distinct
    // location/vente) pour un profil professionnel. 42703 = colonne absente → réessai sans.
    const expire_at = await computeAlerteExpiry(user.id, type)
    let { data, error } = await supabase
      .from("search_requests").insert({ ...criteres, user_id: user.id, expire_at } as never).select("id").single()
    if (error?.code === "42703") {
      const retry = await supabase.from("search_requests").insert({ ...criteres, user_id: user.id } as never).select("id").single()
      data = retry.data; error = retry.error
    }
    if (error || !data) return { error: "Échec de l'enregistrement : " + (error?.message ?? "réessayez.") }
    requestId = (data as unknown as { id: string }).id
  } else {
    // Anonyme : numéro WhatsApp obligatoire (le formulaire l'exige côté front).
    const tel = normalizePhone((form.get("telephone") as string) || "")
    if (!tel) return { error: "Numéro WhatsApp requis pour être alerté sans compte." }
    const nom = (form.get("nom") as string)?.trim() || null

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("search_requests")
      .insert({ ...criteres, user_id: null, contact_telephone: tel, contact_nom: nom } as never)
      .select("id").single()
    if (error) return { error: "Échec de l'enregistrement : " + error.message }
    requestId = (data as { id: string }).id
  }

  try { await runMatchingForRequest(requestId, { notify: false }) }
  catch { /* matching optionnel */ }

  return { ok: true, requestId, anonymous: !user }
}
