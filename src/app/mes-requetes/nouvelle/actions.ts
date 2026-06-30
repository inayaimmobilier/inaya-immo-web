"use server"

import { createClient } from "@/lib/supabase/server"
import { runMatchingForRequest } from "@/lib/matching"
import type { PropertyCat, PropertyType } from "@/types/database"

export async function saveSearchFull(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const type      = (form.get("type") as string) || null
  const categorie = (form.get("categorie") as string) || null
  const quartier  = (form.get("quartier") as string) || null
  const prix_min  = form.get("prix_min") ? Number(form.get("prix_min")) : null
  const prix_max  = form.get("prix_max") ? Number(form.get("prix_max")) : null
  const pieces_min = form.get("pieces_min") ? Number(form.get("pieces_min")) : null
  const q         = (form.get("q") as string) || null

  const payload = {
    user_id:          user.id,
    canal:            "web" as const,
    type_offre:       type as PropertyType | null,
    categories:       categorie ? [categorie as PropertyCat] : null,
    zones:            quartier ? [quartier] : null,
    budget_min:       prix_min,
    budget_max:       prix_max,
    nb_pieces_min:    pieces_min,
    description_libre: q,
    statut:           "active" as const,
  }

  const { data, error } = await supabase
    .from("search_requests").insert(payload as never).select("id").single()
  if (error) return { error: "Échec de l'enregistrement : " + error.message }

  const requestId = (data as { id: string }).id
  try { await runMatchingForRequest(requestId, { notify: false }) }
  catch { /* matching optionnel */ }

  return { ok: true, requestId }
}
