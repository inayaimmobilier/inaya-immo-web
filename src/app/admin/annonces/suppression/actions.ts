"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient, createClient } from "@/lib/supabase/server"

// ============================================================================
// Suppression GROUPÉE d'annonces par critères (type d'offre, plage de budget,
// plage de dates, statut). Réservé aux administrateurs. Garde-fous : au moins un
// critère requis, annonces liées à des transactions préservées, plafond par appel.
// ============================================================================

export interface DeleteCriteria {
  type_offre?: string
  categorie?: string
  statut?: string
  prix_min?: number | null
  prix_max?: number | null
  date_from?: string | null   // AAAA-MM-JJ (created_at ≥)
  date_to?: string | null     // AAAA-MM-JJ (created_at ≤ fin de journée)
}

const MAX_DELETE = 500

async function callerRole(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  return (data as { role: string } | null)?.role ?? null
}

/** Id de l'utilisateur courant (auteur de la suppression, pour le journal). */
async function callerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function hasAnyCriterion(c: DeleteCriteria): boolean {
  return !!(c.type_offre || c.categorie || c.statut || c.prix_min != null || c.prix_max != null || c.date_from || c.date_to)
}

type Row = { id: string; reference: number | null; titre: string; prix: number | null; type_offre: string; statut: string; created_at: string }

// Applique les critères à un builder PostgREST (typé souplement : eq/gte/lte
// renvoient le même builder ; on évite un générique trop strict).
/* eslint-disable @typescript-eslint/no-explicit-any */
function applyCriteria(q: any, c: DeleteCriteria): any {
  if (c.type_offre) q = q.eq("type_offre", c.type_offre)
  if (c.categorie) q = q.eq("categorie", c.categorie)
  if (c.statut) q = q.eq("statut", c.statut)
  if (c.prix_min != null) q = q.gte("prix", c.prix_min)
  if (c.prix_max != null) q = q.lte("prix", c.prix_max)
  if (c.date_from) q = q.gte("created_at", `${c.date_from}T00:00:00`)
  if (c.date_to) q = q.lte("created_at", `${c.date_to}T23:59:59`)
  return q
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Aperçu : combien d'annonces correspondent + un échantillon. */
export async function countMatching(c: DeleteCriteria): Promise<
  { ok: true; count: number; sample: Row[] } | { ok: false; error: string }
> {
  const role = await callerRole()
  if (!role || !["super_admin", "admin"].includes(role)) return { ok: false, error: "Accès réservé aux administrateurs." }
  if (!hasAnyCriterion(c)) return { ok: false, error: "Précisez au moins un critère (sinon toutes les annonces correspondraient)." }

  const admin = createAdminClient()
  const base = admin.from("properties").select("id,reference,titre,prix,type_offre,statut,created_at", { count: "exact" })
  const { data, count, error } = await applyCriteria(base, c).order("created_at", { ascending: false }).limit(12)
  if (error) return { ok: false, error: error.message }
  return { ok: true, count: count ?? 0, sample: (data ?? []) as Row[] }
}

/** Supprime les annonces correspondant aux critères (hors annonces à transactions). */
export async function bulkDelete(c: DeleteCriteria): Promise<
  { ok: true; deleted: number; skipped: number; capped: boolean } | { ok: false; error: string }
> {
  const role = await callerRole()
  if (!role || !["super_admin", "admin"].includes(role)) return { ok: false, error: "Suppression réservée aux administrateurs." }
  if (!hasAnyCriterion(c)) return { ok: false, error: "Précisez au moins un critère." }

  const admin = createAdminClient()
  const base = admin.from("properties").select("id")
  const { data, error } = await applyCriteria(base, c).order("created_at", { ascending: false }).limit(MAX_DELETE + 1)
  if (error) return { ok: false, error: error.message }
  let ids = ((data ?? []) as { id: string }[]).map(r => r.id)
  const capped = ids.length > MAX_DELETE
  if (capped) ids = ids.slice(0, MAX_DELETE)
  if (ids.length === 0) return { ok: true, deleted: 0, skipped: 0, capped: false }

  // Préserve les annonces liées à des transactions (données financières).
  const { data: txn } = await admin.from("transactions").select("property_id").in("property_id", ids)
  const linked = new Set(((txn ?? []) as { property_id: string }[]).map(t => t.property_id))
  const toDelete = ids.filter(id => !linked.has(id))
  const skipped = ids.length - toDelete.length
  if (toDelete.length === 0) return { ok: true, deleted: 0, skipped, capped }

  // Journalise AVANT suppression (alimente les statistiques admin).
  const { logPropertyDeletions } = await import("@/lib/deletion-log")
  await logPropertyDeletions(toDelete, { source: "groupee", deletedBy: await callerId() })

  // Dépendances sans ON DELETE CASCADE, puis les annonces.
  await admin.from("moderation_logs").delete().in("property_id", toDelete)
  await admin.from("leads").delete().in("property_id", toDelete)
  const { error: delErr } = await admin.from("properties").delete().in("id", toDelete)
  if (delErr) { console.error("INAYA-BULK-DEL", delErr); return { ok: false, error: "Échec partiel de la suppression. Réessayez." } }

  revalidatePath("/admin/annonces")
  return { ok: true, deleted: toDelete.length, skipped, capped }
}
