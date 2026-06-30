import { redirect } from "next/navigation"
import { MapPin } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import ZonesManager from "./ZonesManager"

export const metadata = { title: "Zones géographiques · Inaya Immo" }

interface Ville { id: string; nom: string; actif: boolean; ordre: number }

export default async function ZonesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/zones")

  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const admin = createAdminClient()
  const { data } = await admin.from("villes").select("id,nom,actif,ordre").order("ordre").order("nom")
  const villes = (data ?? []) as Ville[]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-blue-600" /> Zones géographiques
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Villes et quartiers affichés dans les formulaires d&apos;annonce et de recherche.
        </p>
      </div>
      <ZonesManager initial={villes} />
      <p className="text-xs text-gray-400">
        Une ville ou un quartier désactivé (œil barré) n&apos;apparaît plus dans les listes publiques
        mais les annonces existantes liées restent inchangées.
      </p>
    </div>
  )
}
