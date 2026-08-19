import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"
import { vehiculeVide } from "@/lib/vehicules"
import { listerEquipements, loueurDeProfil } from "@/lib/vehicules-serveur"
import VehiculeForm from "@/components/vehicules/VehiculeForm"

export const metadata = { title: "Ajouter un véhicule · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function NouveauVehiculeLoueurPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/loueur/vehicules/nouveau")

  const loueur = await loueurDeProfil(user.id)
  if (!loueur || loueur.statut !== "actif") redirect("/loueur")

  const equipements = await listerEquipements()

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <Link href="/loueur" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Retour à ma flotte
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Ajouter un véhicule</h1>
      {/* Pas de choix du propriétaire : c'est forcément lui, et le serveur le
          réimpose de toute façon. */}
      <VehiculeForm initial={vehiculeVide(loueur.id)} equipements={equipements} retour="/loueur" />
    </div>
  )
}
