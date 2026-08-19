import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"
import type { UserRole } from "@/types/database"
import { chargerVehicule, listerEquipements, listerLoueursActifs } from "@/lib/vehicules-serveur"
import VehiculeForm from "@/components/vehicules/VehiculeForm"

export const metadata = { title: "Modifier un véhicule · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function EditerVehiculePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/admin/vehicules/${id}`)
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const [vehicule, equipements, loueurs] = await Promise.all([
    chargerVehicule(id), listerEquipements(), listerLoueursActifs(),
  ])
  if (!vehicule) notFound()

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <Link href="/admin/vehicules" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Retour aux véhicules
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">
        {vehicule.marque} {vehicule.modele}
      </h1>
      <VehiculeForm initial={vehicule} vehiculeId={id} equipements={equipements}
        loueurs={loueurs} retour="/admin/vehicules" />
    </div>
  )
}
