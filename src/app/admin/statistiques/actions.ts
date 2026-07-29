"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { logPropertyDeletions } from "@/lib/deletion-log"
import { deletionsOverTime, type DeletionPoint } from "@/lib/admin-stats"

async function caller(): Promise<{ id: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: string } | null)?.role
  if (!role) return null
  return { id: user.id, role }
}

/** Suppression des annonces sélectionnées depuis l'écran Statistiques. */
export async function deleteSelected(ids: string[]): Promise<
  { ok: true; deleted: number; skipped: number } | { ok: false; error: string }
> {
  const me = await caller()
  if (!me || !["super_admin", "admin"].includes(me.role)) {
    return { ok: false, error: "Suppression réservée aux administrateurs." }
  }
  const clean = ids.filter(Boolean).slice(0, 200)
  if (clean.length === 0) return { ok: false, error: "Aucune annonce sélectionnée." }

  const admin = createAdminClient()
  // Préserve les annonces liées à une transaction (données financières).
  const { data: txn } = await admin.from("transactions").select("property_id").in("property_id", clean)
  const linked = new Set(((txn ?? []) as { property_id: string }[]).map(t => t.property_id))
  const toDelete = clean.filter(id => !linked.has(id))
  const skipped = clean.length - toDelete.length
  if (toDelete.length === 0) return { ok: true, deleted: 0, skipped }

  await logPropertyDeletions(toDelete, { source: "admin", deletedBy: me.id })
  await admin.from("moderation_logs").delete().in("property_id", toDelete)
  await admin.from("leads").delete().in("property_id", toDelete)
  const { error } = await admin.from("properties").delete().in("id", toDelete)
  if (error) { console.error("INAYA-STATS-DEL", error.message); return { ok: false, error: "Échec de la suppression." } }

  revalidatePath("/admin/statistiques")
  revalidatePath("/admin/annonces")
  return { ok: true, deleted: toDelete.length, skipped }
}

/** Recharge les suppressions sur une période choisie par l'admin. */
export async function loadDeletions(from: string, to: string): Promise<
  { ok: true; points: DeletionPoint[]; total: number; disponible: boolean } | { ok: false; error: string }
> {
  const me = await caller()
  if (!me || !["super_admin", "admin", "moderateur"].includes(me.role)) {
    return { ok: false, error: "Accès refusé." }
  }
  const r = await deletionsOverTime(from, to)
  return { ok: true, ...r }
}
