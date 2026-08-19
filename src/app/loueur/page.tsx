import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Car, Plus, Clock, ShieldAlert, CalendarDays } from "lucide-react"
import { listerVehicules, loueurDeProfil } from "@/lib/vehicules-serveur"
import ListeVehicules from "@/components/vehicules/ListeVehicules"

export const metadata = { title: "Ma flotte · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function EspaceLoueurPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/loueur")

  const loueur = await loueurDeProfil(user.id)

  // Compte sans dossier loueur : la personne s'est connectée avec un compte
  // ordinaire. On l'oriente au lieu de l'abandonner sur une page vide.
  if (!loueur) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <Car className="w-10 h-10 text-gray-300 mx-auto" />
        <h1 className="text-xl font-bold text-gray-900">Aucun dossier de loueur</h1>
        <p className="text-sm text-gray-600">
          Ce compte n&apos;est rattaché à aucun dossier de mise en location.
        </p>
        <Link href="/devenir-loueur" className="inline-block bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          Proposer mes véhicules
        </Link>
      </div>
    )
  }

  // Dossier déposé mais pas encore validé : il peut préparer ses fiches, elles
  // ne partiront au catalogue qu'à l'activation.
  if (loueur.statut !== "actif") {
    const enAttente = loueur.statut === "en_attente"
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        {enAttente ? <Clock className="w-10 h-10 text-amber-400 mx-auto" />
                   : <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />}
        <h1 className="text-xl font-bold text-gray-900">
          {enAttente ? "Dossier en cours de vérification" : "Compte non actif"}
        </h1>
        <p className="text-sm text-gray-600">
          {enAttente
            ? "Un conseiller vérifie vos informations et vous rappelle. Vous pourrez ajouter vos véhicules dès l'activation."
            : "Votre compte de loueur n'est pas actif. Contactez-nous pour connaître la marche à suivre."}
        </p>
      </div>
    )
  }

  const vehicules = await listerVehicules(loueur.id)
  const nom = loueur.raison_sociale || loueur.nom_contact || "Ma flotte"

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Car className="w-6 h-6 text-blue-600" /> {nom}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {vehicules.length} véhicule{vehicules.length > 1 ? "s" : ""} ·{" "}
            {vehicules.filter(v => v.publie).length} en ligne
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Les demandes de location arrivent ici : sans ce lien, le loueur
              devrait deviner l'adresse pour voir ses réservations. */}
          <Link href="/loueur/locations"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            <CalendarDays className="w-4 h-4 text-blue-600" /> Mes locations
          </Link>
          <Link href="/loueur/vehicules/nouveau"
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> Ajouter un véhicule
          </Link>
        </div>
      </div>
      <ListeVehicules vehicules={vehicules} base="/loueur/vehicules" />
    </div>
  )
}
