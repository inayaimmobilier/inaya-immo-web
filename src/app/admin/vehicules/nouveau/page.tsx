import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"
import type { UserRole } from "@/types/database"
import { vehiculeVide } from "@/lib/vehicules"
import { listerEquipements, listerLoueursActifs } from "@/lib/vehicules-serveur"
import VehiculeForm from "@/components/vehicules/VehiculeForm"

export const metadata = { title: "Nouveau véhicule · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function NouveauVehiculePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/vehicules/nouveau")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const [equipements, loueurs] = await Promise.all([listerEquipements(), listerLoueursActifs()])

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <Link href="/admin/vehicules" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Retour aux véhicules
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Nouveau véhicule</h1>
      {loueurs.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
          Aucun loueur actif. Créez d&apos;abord le propriétaire dans{" "}
          <Link href="/admin/loueurs" className="underline">Loueurs</Link>.
        </p>
      ) : (
        <VehiculeForm initial={vehiculeVide()} equipements={equipements}
          loueurs={loueurs} retour="/admin/vehicules" />
      )}
    </div>
  )
}
