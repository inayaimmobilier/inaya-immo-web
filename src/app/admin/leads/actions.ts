"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Result = { ok: true; count: number } | { ok: false; error: string }

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return !!role && ["super_admin", "admin"].includes(role)
}

/** Supprime les relances liées puis les leads (pas de cascade garantie). */
async function purgeLeads(ids: string[]): Promise<void> {
  const admin = createAdminClient()
  await admin.from("lead_followups").delete().in("lead_id", ids)
  await admin.from("leads").delete().in("id", ids)
}

/**
 * Suppression MULTIPLE de leads sélectionnés (réservé admin/super_admin).
 * Garde-fou : liste d'ids explicite — jamais de « supprimer tout » implicite.
 */
export async function deleteLeads(ids: string[]): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Suppression réservée aux administrateurs." }
  const clean = Array.from(new Set((ids ?? []).filter(id => typeof id === "string" && id.trim())))
  if (clean.length === 0) return { ok: false, error: "Aucun lead sélectionné." }

  const admin = createAdminClient()
  await admin.from("lead_followups").delete().in("lead_id", clean)
  const { error } = await admin.from("leads").delete().in("id", clean)
  if (error) { console.error("INAYA-LEAD-020", error); return { ok: false, error: "Échec de la suppression." } }

  revalidatePath("/admin/leads")
  return { ok: true, count: clean.length }
}

/**
 * Suppression de TOUS les leads (optionnellement filtrés par statut) — action
 * destructive et irréversible, réservée admin/super_admin.
 *
 * DOUBLE GARDE-FOU : le client doit envoyer le mot de confirmation exact
 * « SUPPRIMER » (re-vérifié ici côté serveur) — évite tout déclenchement par
 * mégarde. Renvoie le nombre de leads supprimés.
 */
export async function deleteAllLeads(opts: { statut?: string; confirm: string }): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Suppression réservée aux administrateurs." }
  if (opts?.confirm !== "SUPPRIMER") return { ok: false, error: "Confirmation invalide." }

  const admin = createAdminClient()
  // On récupère les ids concernés (filtrés par statut le cas échéant) pour purger
  // aussi leurs relances, puis on supprime.
  let q = admin.from("leads").select("id")
  if (opts.statut) q = q.eq("statut", opts.statut)
  const { data, error: selErr } = await q
  if (selErr) { console.error("INAYA-LEAD-021", selErr); return { ok: false, error: "Échec de la lecture des leads." } }
  const ids = ((data ?? []) as { id: string }[]).map(r => r.id)
  if (ids.length === 0) return { ok: true, count: 0 }

  // Suppression par lots pour éviter les URL trop longues (in(...) volumineux).
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    await purgeLeads(ids.slice(i, i + CHUNK))
  }

  revalidatePath("/admin/leads")
  return { ok: true, count: ids.length }
}
