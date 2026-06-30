import { Home, Building2, DoorOpen, LandPlot, Store, Briefcase, ShoppingBag } from "lucide-react"

const CATEGORIE_ICON: Record<string, typeof Home> = {
  maison: Home,
  appartement: Building2,
  studio: DoorOpen,
  terrain: LandPlot,
  local_commercial: Store,
  bureau: Briefcase,
  magasin: ShoppingBag,
  autre: Home,
}

const CATEGORIE_GRADIENT: Record<string, string> = {
  maison: "from-blue-500 to-blue-800",
  appartement: "from-indigo-500 to-blue-800",
  studio: "from-sky-500 to-indigo-700",
  terrain: "from-emerald-500 to-teal-800",
  local_commercial: "from-amber-500 to-orange-700",
  bureau: "from-slate-500 to-slate-800",
  magasin: "from-amber-500 to-rose-700",
  autre: "from-blue-500 to-slate-800",
}

/**
 * Illustration de repli quand une annonce n'a ni photo ni vidéo.
 * Dégradé + icône propres à la catégorie — plus professionnel qu'un message
 * "Pas de photo" générique.
 */
export default function PropertyPlaceholder({ categorie, className = "" }: { categorie: string; className?: string }) {
  const Icon = CATEGORIE_ICON[categorie] ?? Home
  const gradient = CATEGORIE_GRADIENT[categorie] ?? "from-blue-500 to-blue-800"

  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden ${className}`}>
      <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="175" cy="15" r="85" fill="white" />
        <circle cx="5" cy="195" r="65" fill="white" />
      </svg>
      <Icon className="w-14 h-14 text-white/90 relative z-10" strokeWidth={1.25} />
    </div>
  )
}
