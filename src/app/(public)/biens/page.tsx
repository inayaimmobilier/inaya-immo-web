import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import PropertyCard from "@/components/properties/PropertyCard"
import PropertyFilters from "@/components/properties/PropertyFilters"
import Navbar from "@/components/shared/Navbar"
import SaveSearchButton from "./SaveSearchButton"
import SaveSearchLink from "./SaveSearchLink"
import { LayoutGrid, List } from "lucide-react"

const PER_PAGE = 12

interface PageProps {
  searchParams: Promise<{
    type?: string
    categorie?: string
    quartier?: string
    quartier_id?: string   // depuis HomeSearch (UUID → résolu en nom)
    prix_min?: string
    prix_max?: string
    pieces_min?: string
    q?: string
    page?: string
  }>
}

export const metadata = {
  title: "Annonces immobilières à Bouaké",
  description: "Trouvez des maisons, appartements, studios et terrains à louer ou à vendre à Bouaké.",
}

async function PropertiesList({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const page = Number(params.page) || 1
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  // Résolution quartier_id (UUID de HomeSearch) → nom texte
  let quartierNom = params.quartier || null
  if (!quartierNom && params.quartier_id) {
    const { data: qRow } = await supabase
      .from("quartiers").select("nom").eq("id", params.quartier_id).single()
    quartierNom = (qRow as { nom: string } | null)?.nom ?? null
  }

  // Les résidences meublées ont leur propre catalogue (/residences) → exclues d'ici.
  let countQ = supabase.from("properties").select("*", { count: "exact", head: true })
    .eq("statut", "publie").neq("type_offre", "residence_meublee")
  let dataQ  = supabase.from("properties")
    .select("id,titre,description,type_offre,categorie,prix,quartier,statut,surface,nb_pieces,nb_chambres,nb_sdb,meuble,created_at,validated_at,property_media(url,type,ordre,thumbnail_url),zones(nom)")
    .eq("statut", "publie")
    .neq("type_offre", "residence_meublee")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (params.type)         { countQ = countQ.eq("type_offre", params.type as never);   dataQ = dataQ.eq("type_offre", params.type as never) }
  if (params.categorie)    { countQ = countQ.eq("categorie", params.categorie as never); dataQ = dataQ.eq("categorie", params.categorie as never) }
  if (quartierNom)         { countQ = countQ.ilike("quartier", `%${quartierNom}%`);     dataQ = dataQ.ilike("quartier", `%${quartierNom}%`) }
  if (params.prix_min)     { countQ = countQ.gte("prix", Number(params.prix_min));      dataQ = dataQ.gte("prix", Number(params.prix_min)) }
  if (params.prix_max)     { countQ = countQ.lte("prix", Number(params.prix_max));      dataQ = dataQ.lte("prix", Number(params.prix_max)) }
  if (params.pieces_min)   { countQ = countQ.gte("nb_pieces", Number(params.pieces_min)); dataQ = dataQ.gte("nb_pieces", Number(params.pieces_min)) }

  const [{ count, error: cErr }, { data, error }] = await Promise.all([countQ, dataQ])

  if (error || cErr) {
    console.error("INAYA-DB-001", error ?? cErr)
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg mb-2">Impossible de charger les annonces.</p>
        <p className="text-sm">Veuillez réessayer dans quelques instants.</p>
      </div>
    )
  }

  const properties = (data ?? []) as unknown[]
  const total = count || 0
  const totalPages = Math.ceil(total / PER_PAGE)

  if (!properties || properties.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4">🏠</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune annonce trouvée</h3>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Aucun bien ne correspond à vos critères pour l&apos;instant.
          Nous vous alerterons dès qu&apos;un bien correspondant sera disponible.
        </p>
        <Suspense>
          <SaveSearchLink />
        </Suspense>
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-gray-500 mb-4">
        <span className="font-semibold text-gray-900">{total}</span> annonce{total > 1 ? "s" : ""} trouvée{total > 1 ? "s" : ""}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(properties as { id: string }[]).map((p) => (
          <PropertyCard key={p.id} property={p as never} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-10">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/biens?${new URLSearchParams({ ...params, page: String(p) })}`}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                p === page
                  ? "bg-blue-700 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

export default async function BiensPage({ searchParams }: PageProps) {
  const params = await searchParams
  const typeLabel = params.type === "location" ? "Location" : params.type === "vente" ? "Vente" : "Toutes les annonces"

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        {/* En-tête */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{typeLabel}</h1>
            <p className="text-sm text-gray-500">Bouaké & environs · Annonces vérifiées</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Filtres */}
          <Suspense>
            <PropertyFilters />
          </Suspense>

          {/* Barre d'outils */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              <button className="p-2 bg-white border border-gray-200 rounded-xl text-blue-700 shadow-sm">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button className="p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-gray-600">
                <List className="w-4 h-4" />
              </button>
            </div>
            <SaveSearchButton params={params} />
          </div>

          {/* Liste */}
          <Suspense
            fallback={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl h-72 animate-pulse border border-gray-100" />
                ))}
              </div>
            }
          >
            <PropertiesList searchParams={Promise.resolve(params)} />
          </Suspense>
        </div>
      </main>
    </>
  )
}
