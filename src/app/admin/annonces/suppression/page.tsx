import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import SuppressionForm from "./SuppressionForm"

export const metadata = { title: "Suppression groupée · Inaya Admin" }

export default async function SuppressionGroupeePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/annonces/suppression")

  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suppression groupée d&apos;annonces</h1>
        <p className="text-sm text-gray-500 mt-1">
          Supprimez plusieurs annonces d&apos;un coup selon des critères (type d&apos;offre, budget, dates, statut).
          Prévisualisez toujours le nombre concerné avant de confirmer. Les annonces liées à une transaction sont préservées.
        </p>
      </div>
      <SuppressionForm />
    </div>
  )
}
