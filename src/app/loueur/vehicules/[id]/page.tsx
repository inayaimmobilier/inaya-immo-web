import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"
import { chargerVehicule, listerEquipements, loueurDeProfil } from "@/lib/vehicules-serveur"
import VehiculeForm from "@/components/vehicules/VehiculeForm"

export const metadata = { title: "Modifier un véhicule · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function EditerVehiculeLoueurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/loueur/vehicules/${id}`)

  const loueur = await loueurDeProfil(user.id)
  if (!loueur || loueur.statut !== "actif") redirect("/loueur")

  const [vehicule, equipements] = await Promise.all([chargerVehicule(id), listerEquipements()])
  if (!vehicule) notFound()
  // La fiche d'un autre loueur n'est même pas affichée : laisser voir puis
  // refuser à l'enregistrement divulguerait déjà le contenu.
  if (vehicule.loueur_id !== loueur.id) redirect("/loueur")

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <Link href="/loueur" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Retour à ma flotte
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">{vehicule.marque} {vehicule.modele}</h1>
      <VehiculeForm initial={vehicule} vehiculeId={id} equipements={equipements} retour="/loueur" />
    </div>
  )
}
