import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import EditPropertyForm, { type EditableProperty } from "./EditPropertyForm"

export const metadata = { title: "Modifier mon annonce · Inaya Immo" }

export default async function EditMyPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/proprietaire/biens/${id}`)

  const admin = createAdminClient()

  // Vérification stricte de propriété AVANT d'afficher quoi que ce soit :
  // un identifiant d'annonce dans l'URL ne doit jamais suffire à y accéder.
  const { data: pub } = await admin
    .from("property_publishers").select("id").eq("property_id", id).eq("publisher_id", user.id).maybeSingle()
  if (!pub) notFound()

  const { data } = await admin
    .from("properties")
    .select("id, titre, description, type_offre, categorie, prix, quartier, ville, mois_caution, mois_avance, mois_agence, cout_cession, loyer_cession, conditions_acquisition")
    .eq("id", id).maybeSingle()
  const property = data as EditableProperty | null
  if (!property) notFound()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Link href="/proprietaire/biens" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700">
        <ArrowLeft className="w-4 h-4" /> Retour à mes biens
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modifier mon annonce</h1>
        <p className="text-sm text-gray-500 mt-0.5">{property.titre}</p>
      </div>
      <EditPropertyForm property={property} />
    </div>
  )
}
