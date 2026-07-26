import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import BlacklistManager, { type BlacklistEntry } from "./BlacklistManager"

export const metadata = { title: "Liste noire · Inaya Admin" }

export default async function AdminBlacklistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/blacklist")

  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  let entries: BlacklistEntry[] = []
  try {
    const { data } = await admin.from("blacklist")
      .select("id, type, valeur, motif, notes, actif, user_id, created_at")
      .order("created_at", { ascending: false })
    entries = (data ?? []) as BlacklistEntry[]
  } catch { /* table absente avant migration 047 */ }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Liste noire</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bloquez des utilisateurs par numéro ou e-mail — y compris avant qu&apos;ils ne créent un compte.
          Une entrée active empêche l&apos;inscription, la connexion et l&apos;accès à l&apos;app. Bloquer un numéro
          bannit aussi les comptes existants qui l&apos;utilisent.
        </p>
      </div>
      <BlacklistManager initialEntries={entries} />
    </div>
  )
}
