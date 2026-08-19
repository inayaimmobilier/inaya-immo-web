import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Car, Plus } from "lucide-react"
import type { UserRole } from "@/types/database"
import { listerVehicules } from "@/lib/vehicules-serveur"
import ListeVehicules from "@/components/vehicules/ListeVehicules"

export const metadata = { title: "Véhicules · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function VehiculesAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/vehicules")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const vehicules = await listerVehicules()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Car className="w-6 h-6 text-blue-600" /> Véhicules
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Toute la flotte confiée à la plateforme, tous loueurs confondus.
          </p>
        </div>
        <Link href="/admin/vehicules/nouveau"
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Nouveau véhicule
        </Link>
      </div>
      <ListeVehicules vehicules={vehicules} base="/admin/vehicules" montrerLoueur />
    </div>
  )
}
