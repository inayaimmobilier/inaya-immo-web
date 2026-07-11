"use server"

import { createAdminClient } from "@/lib/supabase/server"

type Res = { ok: true; already?: boolean } | { ok: false; error: string }

/**
 * Désactive l'alerte d'une requête via son numéro (« R820 » → 820).
 * Appelé UNIQUEMENT sur action explicite du client (bouton), jamais au simple
 * chargement de la page — pour éviter que les robots d'aperçu de lien (WhatsApp)
 * ne désactivent l'alerte automatiquement.
 */
export async function stopAlert(ref: number): Promise<Res> {
  if (!Number.isFinite(ref) || ref <= 0) return { ok: false, error: "Référence invalide." }
  const admin = createAdminClient()
  const { data } = await admin.from("search_requests").select("id, statut").eq("reference", ref).maybeSingle()
  const req = data as { id: string; statut: string } | null
  if (!req) return { ok: false, error: "Aucune alerte à ce numéro." }
  if (req.statut !== "active") return { ok: true, already: true }
  const { error } = await admin.from("search_requests").update({ statut: "expiree" } as never).eq("id", req.id)
  if (error) { console.error("INAYA-ALERT-STOP-WEB", error); return { ok: false, error: "Échec de la désactivation." } }
  return { ok: true }
}
