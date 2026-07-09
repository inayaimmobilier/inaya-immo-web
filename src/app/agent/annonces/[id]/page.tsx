import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import OwnerEditForm, { type EditableProperty } from "@/components/properties/OwnerEditForm"
import { updateMyAgentProperty, deleteMyAgentProperty } from "./actions"

export const metadata = { title: "Modifier l'annonce · Inaya Immo" }

export default async function EditAgentPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/agent/annonces/${id}`)

  const admin = createAdminClient()

  // Vérification stricte de propriété AVANT d'afficher quoi que ce soit :
  // un identifiant d'annonce dans l'URL ne doit jamais suffire à y accéder.
  const { data } = await admin
    .from("properties")
    .select("id, titre, description, type_offre, categorie, prix, quartier, ville, mois_caution, mois_avance, mois_agence, cout_cession, loyer_cession, conditions_acquisition, created_by")
    .eq("id", id).maybeSingle()
  const property = data as (EditableProperty & { created_by: string | null }) | null
  if (!property || property.created_by !== user.id) notFound()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Link href="/agent/annonces" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700">
        <ArrowLeft className="w-4 h-4" /> Retour à mes annonces
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modifier l&apos;annonce</h1>
        <p className="text-sm text-gray-500 mt-0.5">{property.titre}</p>
      </div>
      <OwnerEditForm
        property={property}
        updateAction={updateMyAgentProperty.bind(null, id)}
        deleteAction={deleteMyAgentProperty.bind(null, id)}
        redirectAfterDelete="/agent/annonces"
      />
    </div>
  )
}
