"use server"

import { createClient } from "@/lib/supabase/server"
import { runMatchingForRequest } from "@/lib/matching"
import type { PropertyCat, PropertyType } from "@/types/database"

export interface SaveSearchParams {
  type?: string
  categorie?: string
  quartier?: string
  prix_min?: string
  prix_max?: string
  pieces_min?: string
  q?: string
}

type Result =
  | { ok: true; requestId: string; matches: number }
  | { ok: false; needLogin: true }
  | { ok: false; error: string }

/**
 * Sauvegarde la recherche courante (filtres du catalogue) pour l'utilisateur
 * connecté et lance un matching immédiat. Les futures annonces correspondantes
 * déclencheront une alerte (§6.9). Requiert une connexion.
 */
export async function saveSearch(params: SaveSearchParams): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, needLogin: true }

  const payload = {
    user_id: user.id,
    canal: "web" as const,
    type_offre: (params.type || null) as PropertyType | null,
    categories: params.categorie ? [params.categorie as PropertyCat] : null,
    zones: params.quartier ? [params.quartier] : null,
    budget_min: params.prix_min ? Number(params.prix_min) : null,
    budget_max: params.prix_max ? Number(params.prix_max) : null,
    nb_pieces_min: params.pieces_min ? Number(params.pieces_min) : null,
    description_libre: params.q || null,
    statut: "active" as const,
  }

  const { data, error } = await supabase
    .from("search_requests").insert(payload as never).select("id").single()
  if (error) {
    console.error("INAYA-DB-050", error)
    return { ok: false, error: "Échec de l'enregistrement de la recherche." }
  }

  const requestId = (data as { id: string }).id
  // Matching immédiat sans notification (l'utilisateur voit déjà les résultats).
  let matches = 0
  try { matches = (await runMatchingForRequest(requestId, { notify: false })).length }
  catch (e) { console.error("INAYA-MATCH-004", e) }

  return { ok: true, requestId, matches }
}
