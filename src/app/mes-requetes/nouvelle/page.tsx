import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import NouvelleRequeteForm from "./NouvelleRequeteForm"

export const metadata = { title: "Nouvelle recherche · Inaya Immo" }

interface PageProps {
  searchParams: Promise<{
    type?: string; categorie?: string; quartier?: string; quartier_id?: string
    prix_min?: string; prix_max?: string; pieces_min?: string; q?: string
  }>
}

export default async function NouvelleRequetePage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const params = await searchParams
  const qs = new URLSearchParams(params as Record<string, string>).toString()

  if (!user) {
    redirect(`/connexion?redirect=${encodeURIComponent(`/mes-requetes/nouvelle${qs ? `?${qs}` : ""}`)}`)
  }

  // Résolution quartier_id → nom si venu de HomeSearch
  let quartierNom = params.quartier || ""
  if (!quartierNom && params.quartier_id) {
    const admin = createAdminClient()
    const { data } = await admin.from("quartiers").select("nom").eq("id", params.quartier_id).single()
    quartierNom = (data as { nom: string } | null)?.nom ?? ""
  }

  // Quartiers pour le select
  const admin = createAdminClient()
  const { data: quartiersData } = await admin
    .from("quartiers").select("id,nom").eq("actif", true).order("ordre").order("nom")
  const quartiers = (quartiersData ?? []) as { id: string; nom: string }[]

  const initial = {
    type: params.type || "",
    categorie: params.categorie || "",
    quartier: quartierNom,
    prix_min: params.prix_min || "",
    prix_max: params.prix_max || "",
    pieces_min: params.pieces_min || "",
    q: params.q || "",
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-xl mx-auto px-4">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Sauvegarder ma recherche</h1>
            <p className="text-sm text-gray-500 mt-1">
              Vous serez alerté(e) par email dès qu&apos;un bien correspondant est publié.
            </p>
          </div>
          <NouvelleRequeteForm initial={initial} quartiers={quartiers} />
        </div>
      </main>
    </>
  )
}
