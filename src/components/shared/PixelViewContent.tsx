"use client"

import { useEffect } from "react"
import { fbTrack } from "@/lib/analytics"

/**
 * Émet l'événement Pixel Meta « ViewContent » à l'ouverture d'une fiche annonce
 * (rendue par un composant serveur). No-op si le pixel n'est pas chargé.
 */
export default function PixelViewContent({ id, value, category }: { id: string; value?: number | null; category?: string }) {
  useEffect(() => {
    fbTrack("ViewContent", {
      content_ids: [id],
      content_type: "product",
      content_category: category,
      value: value ?? undefined,
      currency: "XOF",
    })
  }, [id, value, category])
  return null
}
