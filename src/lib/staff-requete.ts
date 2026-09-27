import type { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { staffDepuisEntete, type RoleStaff } from "@/lib/admin-mobile"

const ROLES_STAFF: RoleStaff[] = ["super_admin", "admin", "moderateur", "agent"]

/**
 * Rôle du staff à l'origine de la requête, quelle que soit sa provenance :
 *  - l'application « Inaya Admin » envoie son jeton en `Authorization: Bearer` ;
 *  - le back-office web s'appuie sur la session Supabase (cookie).
 *
 * Une même route sert ainsi les deux — l'envoi de photos, par exemple, que
 * l'app admin fait lors d'un import Facebook et le site depuis la fiche annonce.
 * Renvoie `null` si l'appelant n'est pas un membre du staff.
 */
export async function roleStaffDeRequete(req: NextRequest): Promise<RoleStaff | null> {
  const entete = req.headers.get("authorization")
  if (entete?.toLowerCase().startsWith("bearer ")) {
    return (await staffDepuisEntete(entete))?.role ?? null
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: string } | null)?.role
  return role && ROLES_STAFF.includes(role as RoleStaff) ? (role as RoleStaff) : null
}
