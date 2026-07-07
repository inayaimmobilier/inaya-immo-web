"use client"

/**
 * Squelette réaliste pour les cartes d'annonces pendant le chargement.
 * Reproduit la structure exacte de PropertyCard sans les données.
 */
export default function PropertyCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl overflow-hidden border border-gray-100"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {/* Photo area */}
          <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 animate-shimmer overflow-hidden">
            <div className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-slide" />
          </div>
          {/* Infos */}
          <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-100 rounded-full w-3/4" />
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-100 rounded-full flex-shrink-0" />
              <div className="h-3 bg-gray-100 rounded-full w-1/2" />
            </div>
            <div className="border-t border-gray-50 pt-3 flex gap-3">
              <div className="h-3 bg-gray-100 rounded-full w-12" />
              <div className="h-3 bg-gray-100 rounded-full w-10" />
              <div className="h-3 bg-gray-100 rounded-full w-14" />
            </div>
            <div className="flex justify-between items-end">
              <div className="h-5 bg-gray-100 rounded-full w-24" />
              <div className="h-7 bg-gray-100 rounded-lg w-20" />
            </div>
            <div className="border-t border-gray-50 pt-2.5">
              <div className="h-2.5 bg-gray-100 rounded-full w-32" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
