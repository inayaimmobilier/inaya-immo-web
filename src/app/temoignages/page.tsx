import Navbar from "@/components/shared/Navbar"
import { Star } from "lucide-react"
import { getPublishedTestimonials } from "@/lib/testimonials"
import { formatRelativeDate } from "@/lib/utils"
import TestimonialForm from "./TestimonialForm"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Avis & témoignages · Inaya Immo",
  description: "Ce que les utilisateurs pensent d'Inaya Immo.",
}

function Stars({ note, size = "w-4 h-4" }: { note: number; size?: string }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`${size} ${n <= Math.round(note) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
    </span>
  )
}

export default async function TemoignagesPage() {
  const { items, average, count } = await getPublishedTestimonials()

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
            <h1 className="text-2xl font-bold text-gray-900">Avis & témoignages</h1>
            {count > 0 ? (
              <div className="flex items-center gap-3 mt-2">
                <Stars note={average} size="w-5 h-5" />
                <span className="text-sm text-gray-600"><strong className="text-gray-900">{average}</strong>/5 · {count} avis</span>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Soyez le premier à donner votre avis sur Inaya Immo.</p>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des témoignages */}
          <div className="lg:col-span-2 space-y-4">
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500 text-sm">
                Aucun avis publié pour l&apos;instant.
              </div>
            ) : items.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between gap-2">
                  <Stars note={t.note} />
                  <span className="text-xs text-gray-400">{formatRelativeDate(t.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{t.message}</p>
                <p className="text-sm font-semibold text-gray-900 mt-3">— {t.nom}</p>
              </div>
            ))}
          </div>

          {/* Formulaire */}
          <div className="lg:col-span-1">
            <TestimonialForm />
          </div>
        </div>
      </main>
    </>
  )
}
