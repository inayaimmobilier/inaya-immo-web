import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Car, Plus, AlertTriangle } from "lucide-react"
import type { UserRole } from "@/types/database"
import { listerVehicules, alertesDocuments } from "@/lib/vehicules-serveur"
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

  const [vehicules, alertes] = await Promise.all([listerVehicules(), alertesDocuments()])

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
      {/* Une assurance expirée immobilise le véhicule et engage la
          responsabilité de la plateforme : l'alerte est en haut de l'écran,
          pas dans un onglet qu'on ouvre une fois par mois. */}
      {alertes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {alertes.length} document{alertes.length > 1 ? "s" : ""} à renouveler
          </p>
          <ul className="mt-2 space-y-1">
            {alertes.slice(0, 8).map(a => (
              <li key={a.id} className="text-xs text-amber-900 flex items-center gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded font-medium ${
                  a.niveau === "expire" ? "bg-red-100 text-red-800"
                  : a.niveau === "critique" ? "bg-orange-100 text-orange-800"
                  : "bg-amber-100 text-amber-800"}`}>
                  {a.niveau === "expire" ? "Expiré"
                    : a.jours_restants === 0 ? "Expire aujourd'hui"
                    : `${a.jours_restants} j`}
                </span>
                <span className="font-medium">{a.marque} {a.modele}</span>
                {a.immatriculation && <span className="text-amber-700">{a.immatriculation}</span>}
                <span className="text-amber-700">— {a.type.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
          {alertes.length > 8 && (
            <p className="text-[11px] text-amber-700 mt-1">
              et {alertes.length - 8} autre{alertes.length - 8 > 1 ? "s" : ""}.
            </p>
          )}
        </div>
      )}

      <ListeVehicules vehicules={vehicules} base="/admin/vehicules" montrerLoueur />
    </div>
  )
}
