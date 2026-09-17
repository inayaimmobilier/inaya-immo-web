"use client"

import { useState } from "react"
import { Search, Check } from "lucide-react"

/**
 * Copie un extrait du message d'origine, à coller dans la recherche de
 * WhatsApp pour retrouver la publication dans le groupe.
 *
 * On prend la PREMIÈRE ligne significative, sans les numéros de téléphone :
 * c'est ce qui a le plus de chances d'être unique, et la recherche WhatsApp
 * trouve mal un texte trop long ou coupé au milieu d'un mot.
 */
export default function CopierExtrait({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false)

  const extrait = (() => {
    const ligne = texte.split(/\r?\n/).map(l => l.trim()).find(l => l.replace(/[^\p{L}]/gu, "").length >= 8) ?? texte
    const propre = ligne.replace(/(?:\+?\d[\d\s.-]{6,}\d)/g, " ").replace(/[*_~]/g, "").replace(/\s+/g, " ").trim()
    if (propre.length <= 40) return propre
    const coupe = propre.slice(0, 40)
    const dernierEspace = coupe.lastIndexOf(" ")
    return dernierEspace > 20 ? coupe.slice(0, dernierEspace) : coupe
  })()

  async function copier() {
    try {
      await navigator.clipboard.writeText(extrait)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé) : l'extrait reste
      // affiché dans l'infobulle, il peut être sélectionné à la main.
    }
  }

  return (
    <button type="button" onClick={copier} title={`Copier : « ${extrait} »`}
      className="inline-flex items-center gap-1 text-[11px] font-medium bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-2 py-1 rounded-lg">
      {copie ? <Check className="w-3 h-3 text-green-600" /> : <Search className="w-3 h-3" />}
      {copie ? "Extrait copié — collez-le dans WhatsApp" : "Copier un extrait pour WhatsApp"}
    </button>
  )
}
