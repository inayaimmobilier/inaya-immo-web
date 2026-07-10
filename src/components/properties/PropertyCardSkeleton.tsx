// Squelette de carte d'annonce — affiché pendant le chargement (loading.tsx).
// Reproduit la structure de PropertyCard pour éviter un saut de mise en page.
export default function PropertyCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-4/5" />
        <div className="h-3 bg-gray-100 rounded w-2/5" />
        <div className="h-3 bg-gray-100 rounded w-3/5 mt-4" />
        <div className="flex items-center justify-between pt-2">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-6 bg-gray-100 rounded-lg w-20" />
        </div>
        <div className="h-2.5 bg-gray-100 rounded w-1/2 mt-2" />
      </div>
    </div>
  )
}

/** Grille de squelettes (n cartes). */
export function PropertyGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <PropertyCardSkeleton key={i} />)}
    </div>
  )
}
