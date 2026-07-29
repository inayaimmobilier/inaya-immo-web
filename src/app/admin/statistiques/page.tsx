import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import { topViewedProperties, topSearchTerms, countsByStatut, deletionsOverTime, oldestProperties } from "@/lib/admin-stats"
import StatsClient from "./StatsClient"

export const metadata = { title: "Statistiques des annonces · Inaya Admin" }
export const dynamic = "force-dynamic"

const iso = (d: Date) => d.toISOString().slice(0, 10)

export default async function StatistiquesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/statistiques")
  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur"].includes(role)) redirect("/admin/dashboard")

  const to = iso(new Date())
  const from = iso(new Date(Date.now() - 29 * 86_400_000))

  const [vues, recherches, statuts, suppressions, anciennes] = await Promise.all([
    topViewedProperties(30, 15),
    topSearchTerms(90, 12),
    countsByStatut(),
    deletionsOverTime(from, to),
    oldestProperties(20),
  ])

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Statistiques des annonces</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ce qui est consulté, ce qui est cherché, ce qui vieillit — et ce qui a été supprimé.
          Sélectionnez des annonces pour les modifier ou les supprimer directement.
        </p>
      </div>

      <StatsClient
        vues={vues}
        recherches={recherches}
        statuts={statuts}
        suppressions={suppressions}
        anciennes={anciennes}
        defaultFrom={from}
        defaultTo={to}
        canDelete={["super_admin", "admin"].includes(role)}
      />
    </div>
  )
}
