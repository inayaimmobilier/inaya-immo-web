import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { CalendarDays, ArrowLeft } from "lucide-react"
import { listerLocations, loueurDeProfil } from "@/lib/vehicules-serveur"
import ListeLocations from "@/components/vehicules/ListeLocations"

export const metadata = { title: "Mes locations · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function LocationsLoueurPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/loueur/locations")

  const loueur = await loueurDeProfil(user.id)
  if (!loueur || loueur.statut !== "actif") redirect("/loueur")

  const locations = await listerLocations(loueur.id)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Link href="/loueur" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Retour à ma flotte
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <CalendarDays className="w-6 h-6 text-blue-600" /> Mes locations
      </h1>
      <ListeLocations locations={locations} />
    </div>
  )
}
