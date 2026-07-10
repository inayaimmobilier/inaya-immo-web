import PropertyCardSkeleton from "@/components/properties/PropertyCardSkeleton"

// État de chargement de la liste des annonces (Next.js App Router). Reproduit
// l'ossature de la page pour un rendu instantané pendant le chargement des données.
export default function BiensLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 9 }).map((_, i) => <PropertyCardSkeleton key={i} />)}
      </div>
    </div>
  )
}
