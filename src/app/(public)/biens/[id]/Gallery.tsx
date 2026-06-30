"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import PropertyPlaceholder from "@/components/properties/PropertyPlaceholder"

/**
 * Galerie d'images interactive : image principale + miniatures cliquables,
 * navigation par flèches, compteur. Les badges (type, catégorie) sont passés
 * en overlay par la page.
 */
export default function Gallery({ images, alt, badges, categorie }: {
  images: { url: string }[]
  alt: string
  badges?: React.ReactNode
  categorie?: string
}) {
  const [active, setActive] = useState(0)
  const count = images.length
  const current = images[active]?.url ?? null
  const go = (d: number) => setActive(a => (a + d + count) % count)

  return (
    <div className="space-y-2">
      <div className="relative h-72 sm:h-[26rem] bg-gray-100 rounded-2xl overflow-hidden group">
        {current ? (
          <Image src={current} alt={alt} fill className="object-cover" priority />
        ) : (
          <PropertyPlaceholder categorie={categorie ?? "autre"} />
        )}

        {badges && <div className="absolute top-3 left-3 flex gap-2 z-10">{badges}</div>}

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Image précédente"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 text-gray-800 shadow hover:bg-white transition-colors opacity-0 group-hover:opacity-100">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Image suivante"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 text-gray-800 shadow hover:bg-white transition-colors opacity-0 group-hover:opacity-100">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-3 right-3 bg-black/55 text-white text-xs font-medium px-2.5 py-1 rounded-full">
              {active + 1} / {count}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-6">
          {images.map((img, i) => (
            <button key={i} type="button" onClick={() => setActive(i)}
              className={`relative h-16 w-24 sm:w-auto flex-shrink-0 rounded-lg overflow-hidden transition-all ${
                i === active ? "ring-2 ring-blue-500" : "ring-1 ring-gray-100 opacity-80 hover:opacity-100"
              }`}>
              <Image src={img.url} alt={`${alt} ${i + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
