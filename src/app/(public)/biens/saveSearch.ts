"use server"

import { createClient, createAdminClient } from "@/lib/supabase/server"
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
  /** Fournis uniquement pour une sauvegarde anonyme (sans compte). */
  telephone?: string
  nom?: string
}

type Result =
  | { ok: true; requestId: string; matches: number }
  | { ok: false; needPhone: true }
  | { ok: false; error: string }

/** Normalise un numéro WhatsApp ivoirien : garde les chiffres et un éventuel +. */
function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "").trim()
  const digits = cleaned.replace(/\D/g, "")
  // Numéro ivoirien : 10 chiffres locaux, ou format international (225…).
  if (digits.length < 8) return null
  return cleaned
}

/**
 * Sauvegarde la recherche courante (filtres du catalogue) et lance un matching.
 * Les futures annonces correspondantes déclencheront une alerte (§6.9).
 *
 * - Connecté : rattachée au compte, notifications push + WhatsApp.
 * - Anonyme : le numéro WhatsApp est requis (le front le demande) et sert de
 *   canal d'alerte. Si absent, on renvoie `needPhone` pour que le front le
 *   réclame sans forcer la création de compte.
 */
export async function saveSearch(params: SaveSearchParams): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const criteres = {
    type_offre: (params.type || null) as PropertyType | null,
    categories: params.categorie ? [params.categorie as PropertyCat] : null,
    zones: params.quartier ? [params.quartier] : null,
    budget_min: params.prix_min ? Number(params.prix_min) : null,
    budget_max: params.prix_max ? Number(params.prix_max) : null,
    nb_pieces_min: params.pieces_min ? Number(params.pieces_min) : null,
    description_libre: params.q || null,
    statut: "active" as const,
  }

  let requestId: string

  if (user) {
    const { data, error } = await supabase
      .from("search_requests")
      .insert({ ...criteres, user_id: user.id, canal: "web" as const } as never)
      .select("id").single()
    if (error) {
      console.error("INAYA-DB-050", error)
      return { ok: false, error: "Échec de l'enregistrement de la recherche." }
    }
    requestId = (data as { id: string }).id
  } else {
    // Anonyme : numéro WhatsApp obligatoire pour pouvoir recontacter.
    const tel = params.telephone ? normalizePhone(params.telephone) : null
    if (!tel) return { ok: false, needPhone: true }

    // Client admin : l'insert anonyme est permis par la RLS, mais le SELECT-back
    // ne l'est pas → on passe par le service_role pour récupérer l'id.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("search_requests")
      .insert({
        ...criteres,
        user_id: null,
        contact_telephone: tel,
        contact_nom: params.nom?.trim() || null,
        canal: "web" as const,
      } as never)
      .select("id").single()
    if (error) {
      console.error("INAYA-DB-051", error)
      return { ok: false, error: "Échec de l'enregistrement de la recherche." }
    }
    requestId = (data as { id: string }).id
  }

  // Matching immédiat sans notification (l'utilisateur voit déjà les résultats).
  let matches = 0
  try { matches = (await runMatchingForRequest(requestId, { notify: false })).length }
  catch (e) { console.error("INAYA-MATCH-004", e) }

  return { ok: true, requestId, matches }
}
