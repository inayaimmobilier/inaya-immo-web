import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

// ============================================================================
// Qui a le droit de toucher à ce véhicule ?
//
// La même question se pose dans les actions serveur et dans les routes de
// téléversement. Y répondre à deux endroits aurait suffi à ce que l'une des
// deux oublie un cas — et la route d'upload est justement celle qu'on écrit
// vite, en pensant que « de toute façon il faut être connecté ».
// ============================================================================

export interface AccesVehicule {
  autorise: boolean
  admin: boolean
  loueurId: string | null
  userId: string | null
}

/** Droits sur un véhicule précis. Passer `null` pour un simple test de rôle. */
export async function accesVehicule(vehiculeId: string | null): Promise<AccesVehicule> {
  const refus: AccesVehicule = { autorise: false, admin: false, loueurId: null, userId: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return refus

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  const admin = role === "super_admin" || role === "admin"

  const db = createAdminClient()
  let loueurId: string | null = null
  if (!admin) {
    const { data: l } = await db.from("loueurs")
      .select("id").eq("profile_id", user.id).eq("statut", "actif").maybeSingle()
    loueurId = (l as { id: string } | null)?.id ?? null
  }

  if (!vehiculeId) {
    return { autorise: admin || !!loueurId, admin, loueurId, userId: user.id }
  }

  const { data: v } = await db.from("vehicules")
    .select("loueur_id").eq("id", vehiculeId).maybeSingle()
  const proprio = (v as { loueur_id: string } | null)?.loueur_id ?? null
  if (!proprio) return { ...refus, admin, loueurId, userId: user.id }

  return {
    autorise: admin || (!!loueurId && loueurId === proprio),
    admin, loueurId, userId: user.id,
  }
}
