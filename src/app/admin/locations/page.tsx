import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CalendarDays } from "lucide-react"
import type { UserRole } from "@/types/database"
import { listerLocations } from "@/lib/vehicules-serveur"
import ListeLocations from "@/components/vehicules/ListeLocations"

export const metadata = { title: "Locations · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function LocationsAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/locations")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const locations = await listerLocations()
  const enAttente = locations.filter(l => l.statut === "reservee").length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-blue-600" /> Locations de véhicules
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {enAttente > 0
            ? `${enAttente} demande(s) de réservation à confirmer.`
            : "Réservations, locations en cours et historique."}
        </p>
      </div>
      <ListeLocations locations={locations} montrerLoueur />
    </div>
  )
}
