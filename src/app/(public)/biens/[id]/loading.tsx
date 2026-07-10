// État de chargement de la page détail d'une annonce (Next.js App Router).
export default function BienDetailLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Galerie */}
          <div className="h-72 sm:h-[26rem] bg-gray-200 rounded-2xl animate-pulse" />
          {/* Titre + prix */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
            <div className="h-5 w-24 bg-blue-100 rounded" />
            <div className="h-6 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-2/5 bg-gray-100 rounded" />
            <div className="h-8 w-1/3 bg-gray-200 rounded mt-2" />
          </div>
          {/* Caractéristiques */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
            </div>
          </div>
        </div>
        {/* Colonne contact */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
            <div className="h-4 w-1/2 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-100 rounded-xl" />
            <div className="h-10 bg-gray-100 rounded-xl" />
            <div className="h-11 bg-blue-100 rounded-xl mt-2" />
          </div>
        </div>
      </div>
    </div>
  )
}
