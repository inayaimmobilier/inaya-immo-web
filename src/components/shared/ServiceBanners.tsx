import Link from "next/link"
import { ArrowRight } from "lucide-react"

interface Banner {
  id: string
  titre: string
  sous_titre: string | null
  description: string | null
  icone: string
  couleur: string
  cta_label: string | null
  cta_lien: string | null
}

const ACCENT: Record<string, { bg: string; badge: string; btn: string; ring: string }> = {
  blue:    { bg: "bg-blue-50",    badge: "bg-blue-100 text-blue-700",    btn: "bg-blue-700 hover:bg-blue-800 text-white",    ring: "ring-blue-200"    },
  amber:   { bg: "bg-amber-50",   badge: "bg-amber-100 text-amber-700",  btn: "bg-amber-500 hover:bg-amber-600 text-white",  ring: "ring-amber-200"   },
  emerald: { bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700 text-white", ring: "ring-emerald-200" },
  purple:  { bg: "bg-purple-50",  badge: "bg-purple-100 text-purple-700", btn: "bg-purple-700 hover:bg-purple-800 text-white", ring: "ring-purple-200"  },
  rose:    { bg: "bg-rose-50",    badge: "bg-rose-100 text-rose-700",    btn: "bg-rose-600 hover:bg-rose-700 text-white",    ring: "ring-rose-200"    },
  slate:   { bg: "bg-slate-50",   badge: "bg-slate-100 text-slate-700",  btn: "bg-slate-700 hover:bg-slate-800 text-white",  ring: "ring-slate-200"   },
}

export default function ServiceBanners({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null

  return (
    <section className="bg-white border-t border-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900">Nos services</h2>
          <p className="text-sm text-slate-400 mt-1">
            Au-delà des annonces, Inaya vous accompagne à chaque étape de votre projet immobilier.
          </p>
        </div>

        <div className={`grid gap-5 ${
          banners.length === 1 ? "grid-cols-1" :
          banners.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}>
          {banners.map(b => {
            const a = ACCENT[b.couleur] ?? ACCENT.blue
            return (
              <div key={b.id}
                className={`rounded-2xl border border-transparent ring-1 ${a.ring} ${a.bg} p-6 flex flex-col gap-4`}>
                {/* Icône */}
                <span className="text-4xl">{b.icone}</span>

                {/* Texte */}
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 text-base leading-snug">{b.titre}</h3>
                  {b.sous_titre && (
                    <p className="text-sm font-medium text-slate-600 mt-0.5">{b.sous_titre}</p>
                  )}
                  {b.description && (
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed line-clamp-3">{b.description}</p>
                  )}
                </div>

                {/* CTA */}
                {b.cta_label && b.cta_lien && (
                  <Link href={b.cta_lien}
                    className={`self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm ${a.btn}`}>
                    {b.cta_label}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
