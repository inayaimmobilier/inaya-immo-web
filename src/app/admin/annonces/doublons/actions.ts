"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type ActionResult = { ok: true } | { ok: false; error: string }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function requireStaff(): Promise<{ id: string; db: SupabaseClient } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const profile = data as { role: UserRole } | null
  const staff = ["super_admin", "admin", "moderateur", "agent"]
  if (!profile || !staff.includes(profile.role)) return null
  return { id: user.id, db: supabase }
}

/**
 * Fusionne plusieurs annonces sources dans une annonce canonique.
 * Les publieurs sont déplacés et réordonnés par la fonction SQL merge_properties.
 */
export async function mergeIntoCanonical(canonicalId: string, sourceIds: string[]): Promise<ActionResult> {
  const staff = await requireStaff()
  if (!staff) return { ok: false, error: "Action réservée au staff." }
  if (!canonicalId || sourceIds.length === 0) return { ok: false, error: "Sélection invalide." }
  if (sourceIds.includes(canonicalId)) return { ok: false, error: "Le canonical ne peut pas être sa propre source." }

  for (const sourceId of sourceIds) {
    const { error } = await staff.db.rpc(
      "merge_properties" as never,
      { p_source_id: sourceId, p_target_id: canonicalId } as never,
    )
    if (error) {
      console.error("INAYA-STORE-001", error)
      return { ok: false, error: `Échec de la fusion (${sourceId.slice(0, 8)}…).` }
    }
  }

  revalidatePath("/admin/annonces/doublons")
  revalidatePath("/admin/annonces")
  return { ok: true }
}

/**
 * Marque un groupe comme « pas des doublons » : on neutralise l'empreinte des
 * annonces en y ajoutant un suffixe distinct pour qu'elles ne soient plus
 * regroupées (action réversible par re-calcul si un critère change).
 */
export async function dismissGroup(propertyIds: string[]): Promise<ActionResult> {
  const staff = await requireStaff()
  if (!staff) return { ok: false, error: "Action réservée au staff." }

  // On marque dedup_status='unique' explicitement ; le regroupement reste
  // possible mais l'UI peut filtrer les groupes déjà écartés via un flag.
  const { error } = await staff.db
    .from("properties").update({ dedup_status: "unique" } as never).in("id", propertyIds)
  if (error) {
    console.error("INAYA-STORE-002", error)
    return { ok: false, error: "Échec de l'opération." }
  }
  revalidatePath("/admin/annonces/doublons")
  return { ok: true }
}
