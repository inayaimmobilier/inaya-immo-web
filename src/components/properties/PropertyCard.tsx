"use client"

import Link from "next/link"
import Image from "next/image"
import { MapPin, BedDouble, Bath, Maximize2, CheckCircle2, Sparkles } from "lucide-react"
import { formatPrix, formatDateTime, CATEGORIE_LABEL, TYPE_OFFRE_LABEL } from "@/lib/utils"
import PropertyPlaceholder from "./PropertyPlaceholder"
import type { Database } from "@/types/database"

type Property = Database["public"]["Tables"]["properties"]["Row"] & {
  property_media?: Array<{ url: string; type: string; ordre: number; thumbnail_url?: string | null }>
  zones?: { nom: string } | null
  _isNew?: boolean  // pré-calculé côté serveur (< 7 jours depuis validation)
}

export default function PropertyCard({ property }: { property: Property }) {
  const media = property.property_media ?? []
  const photo = media.filter((m) => m.type === "image").sort((a, b) => a.ordre - b.ordre)[0]
  const videoThumb = !photo
    ? media.filter((m) => m.type === "video" && m.thumbnail_url).sort((a, b) => a.ordre - b.ordre)[0]
    : undefined
  const cover = photo?.url ?? videoThumb?.thumbnail_url ?? null

  const isLocation = property.type_offre === "location"
  const isCession  = property.type_offre === "cession"
  const isResidence = property.type_offre === "residence_meublee"
  const PERIODE_SUFFIX: Record<string, string> = { nuit: "/nuit", semaine: "/semaine", mois: "/mois" }
  const residPeriode = (property as unknown as { tarif_periode?: string | null }).tarif_periode
  const residSuffix = PERIODE_SUFFIX[residPeriode ?? "mois"] ?? "/mois"
  const residDisponible = (property as unknown as { disponible?: boolean }).disponible !== false

  return (
    <Link href={`/biens/${property.id}`} className="group block">
      <article className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 hover:border-blue-200 group/card animate-fade-in opacity-0 [animation-fill-mode:forwards]">
        {/* Photo */}
        <div className="relative h-48 bg-gray-100 overflow-hidden">
          {cover ? (
            <Image
              src={cover}
              alt={property.titre}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover/card:scale-105 transition-transform duration-500"
            />
          ) : (
            <PropertyPlaceholder categorie={property.categorie} />
          )}

          {/* Badges */}
          <div className="absolute top-3 left-3 flex gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isResidence ? "bg-teal-600 text-white" :
              isLocation  ? "bg-blue-600 text-white" :
              isCession   ? "bg-purple-600 text-white" :
                            "bg-amber-500 text-white"
            }`}>
              {TYPE_OFFRE_LABEL[property.type_offre]}
            </span>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/90 text-gray-700">
              {CATEGORIE_LABEL[property.categorie]}
            </span>
          </div>

          {/* Badge vérifié OU disponibilité (résidences) */}
          <div className="absolute top-3 right-3">
            {isResidence ? (
              residDisponible ? (
                <span className="flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Disponible
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs bg-gray-700 text-white px-2 py-1 rounded-full">
                  Indisponible
                </span>
              )
            ) : (
              <span className="flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Vérifié
              </span>
            )}
          </div>

          {/* Badge "Nouveau" (coins bas-gauche) */}
          {property._isNew && !isResidence && (
            <div className="absolute bottom-3 left-3">
              <span className="flex items-center gap-1 text-xs bg-white/95 text-blue-700 px-2 py-1 rounded-full shadow-sm font-semibold">
                <Sparkles className="w-3 h-3" /> Nouveau
              </span>
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1.5 line-clamp-2 group-hover/card:text-blue-700 transition-colors duration-200">
            {property.titre}
          </h3>

          {/* Localisation */}
          <div className="flex items-center gap-1 text-gray-500 text-xs mb-3">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {property.quartier || property.zones?.nom || "Bouaké"}
            </span>
          </div>

          {/* Caractéristiques */}
          {(property.nb_chambres || property.nb_sdb || property.surface) && (
            <div className="flex items-center gap-3 text-gray-500 text-xs mb-3 border-t border-gray-50 pt-3">
              {property.nb_chambres && (
                <span className="flex items-center gap-1">
                  <BedDouble className="w-3.5 h-3.5" />
                  {property.nb_chambres} ch.
                </span>
              )}
              {property.nb_sdb && (
                <span className="flex items-center gap-1">
                  <Bath className="w-3.5 h-3.5" />
                  {property.nb_sdb} sdb
                </span>
              )}
              {property.surface && (
                <span className="flex items-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5" />
                  {property.surface} m²
                </span>
              )}
              {property.meuble && (
                <span className="text-xs text-green-600 font-medium ml-auto">
                  Meublé
                </span>
              )}
            </div>
          )}

          {/* Prix */}
          <div className="flex items-end justify-between">
            <div>
              {isCession ? (
                <div>
                  <span className="text-sm font-bold text-purple-700">
                    Cession : {formatPrix(property.prix)}
                  </span>
                  {(property as unknown as { loyer_cession?: number | null }).loyer_cession && (
                    <div className="text-xs text-gray-500">
                      Loyer : {formatPrix((property as unknown as { loyer_cession: number }).loyer_cession)}/mois
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <span className="text-lg font-bold text-blue-700">
                    {formatPrix(property.prix)}
                  </span>
                  {isLocation && (
                    <span className="text-xs text-gray-400 ml-1">/mois</span>
                  )}
                  {isResidence && (
                    <span className="text-xs text-gray-400 ml-1">{residSuffix}</span>
                  )}
                  {(property as unknown as { prix_m2?: number | null }).prix_m2 && (
                    <div className="text-xs text-gray-500">
                      {formatPrix((property as unknown as { prix_m2: number }).prix_m2)}/m²
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                // Scroll au formulaire de contact sur la page détail
              }}
              className="text-xs bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 px-3 py-1.5 rounded-lg font-medium transition-all duration-200 active:scale-95"
            >
              Contacter
            </button>
          </div>

          {/* Date et heure de publication */}
          <p className="text-[11px] text-gray-400 mt-2.5 pt-2.5 border-t border-gray-50">
            Publié le {formatDateTime(property.validated_at ?? property.created_at)}
          </p>
        </div>
      </article>
    </Link>
  )
}
