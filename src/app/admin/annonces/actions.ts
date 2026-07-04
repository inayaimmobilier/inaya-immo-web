"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Result = { ok: true; count: number } | { ok: false; error: string }

async function requireModerator(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return !!role && ["super_admin", "admin", "moderateur"].includes(role)
}

/**
 * Modère en masse (ou à l'unité) des annonces EN ATTENTE : publie ou rejette.
 * Ne touche que les annonces réellement en attente de validation.
 * Publication → matching §6.9 pour chaque annonce (best-effort).
 */
export async function bulkModerate(ids: string[], statut: "publie" | "rejete"): Promise<Result> {
  if (!ids?.length) return { ok: false, error: "Aucune annonce sélectionnée." }
  if (!(await requireModerator())) return { ok: false, error: "Accès réservé aux administrateurs." }

  const admin = createAdminClient()
  const { data, error } = await admin.from("properties")
    .update({ statut, updated_at: new Date().toISOString() } as never)
    .in("id", ids)
    .eq("statut", "en_attente_validation")
    .select("id")
  if (error) {
    console.error("INAYA-MOD-BULK-001", error.message)
    return { ok: false, error: "Échec de l'opération." }
  }
  const updated = (data ?? []).map(r => (r as { id: string }).id)

  if (statut === "publie" && updated.length) {
    try {
      const { runMatchingForProperty } = await import("@/lib/matching")
      for (const id of updated) { await runMatchingForProperty(id).catch(() => {}) }
    } catch (e) { console.error("INAYA-MATCH-007", e) }
  }

  revalidatePath("/admin/annonces")
  return { ok: true, count: updated.length }
}
