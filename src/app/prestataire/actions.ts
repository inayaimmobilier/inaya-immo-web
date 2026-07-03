"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { notifyStaff, notifyUser } from "@/lib/notifications"

type Result = { ok: true } | { ok: false; error: string }

const ALLOWED = ["devis", "en_cours", "termine"]

/** Le prestataire met à jour le statut d'un travaux qui lui est assigné. */
export async function updateTravauxStatus(id: string, statut: string): Promise<Result> {
  if (!ALLOWED.includes(statut)) return { ok: false, error: "Statut invalide." }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = { statut }
  if (statut === "termine") patch.date_fin = new Date().toISOString()
  // Réservé au prestataire assigné (ou au staff).
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const isStaff = ["super_admin", "admin", "moderateur"].includes((prof as { role: string } | null)?.role ?? "")
  let q = admin.from("travaux").update(patch as never).eq("id", id)
  if (!isStaff) q = q.eq("prestataire_id", user.id)
  const { data: updated, error } = await q.select("titre, proprietaire_id").single()
  if (error) { console.error("INAYA-GEST-021", error.message); return { ok: false, error: "Échec de la mise à jour." } }

  // Intervention terminée → prévient le staff et le propriétaire.
  if (statut === "termine") {
    const row = updated as { titre: string | null; proprietaire_id: string | null } | null
    const titre = row?.titre ?? "Intervention"
    try {
      await notifyStaff({ type: "travaux_termine", titre: "Travaux terminés", contenu: `« ${titre} » a été marqué terminé par le prestataire.` })
      await notifyUser(row?.proprietaire_id, { type: "travaux_termine", titre: "Travaux terminés", contenu: `L'intervention « ${titre} » sur votre bien est terminée.` })
    } catch { /* best-effort */ }
  }

  revalidatePath("/prestataire")
  return { ok: true }
}
