import Link from "next/link"
import Navbar from "@/components/shared/Navbar"
import PropertyCard from "@/components/properties/PropertyCard"
import { createClient } from "@/lib/supabase/server"
import { Sofa, PlusCircle } from "lucide-react"

export const metadata = {
  title: "Résidences meublées – Inaya Immo",
  description: "Appartements et studios meublés à Bouaké, vérifiés par Inaya Immo.",
}

type Property = Parameters<typeof PropertyCard>[0]["property"]

export default async function ResidencesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("properties")
    .select("*,property_media(url,type,ordre,thumbnail_url),zones(nom)")
    .eq("statut", "publie")
    .eq("type_offre", "residence_meublee")
    .order("validated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  const residences = (data ?? []) as unknown as Property[]

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Sofa className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">Résidences meublées</h1>
            </div>
            <p className="text-teal-50 text-sm leading-relaxed max-w-lg">
              Appartements et studios meublés à Bouaké, prêts à vivre et vérifiés par Inaya Immo.
            </p>
            <Link
              href="/residences/publier"
              className="inline-flex items-center gap-2 mt-6 bg-white text-teal-800 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-teal-50 transition-colors"
            >
              <PlusCircle className="w-4 h-4" /> Publier une résidence meublée
            </Link>
          </div>
        </div>

        {/* Catalogue */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-sm text-gray-500 mb-5">
            {residences.length} résidence{residences.length > 1 ? "s" : ""} meublée{residences.length > 1 ? "s" : ""} disponible{residences.length > 1 ? "s" : ""}
          </p>

          {residences.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
              <Sofa className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Aucune résidence meublée disponible pour le moment.</p>
              <Link href="/residences/publier" className="inline-block mt-4 text-sm text-teal-700 font-medium hover:text-teal-800">
                Proposer la vôtre →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {residences.map(p => <PropertyCard key={p.id} property={p} />)}
            </div>
          )}
        </div>
      </main>

      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs">
        © {new Date().getFullYear()} Inaya Immo · Bouaké, Côte d&apos;Ivoire
      </footer>
    </>
  )
}
