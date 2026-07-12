"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Check } from "lucide-react"
import { COUNTRIES, flagEmoji, type Country } from "@/lib/countries"

/**
 * Sélecteur d'indicatif pays compact.
 *
 * Replié : n'affiche QUE le drapeau + l'indicatif (ex. « 🇨🇮 +225 ») pour ne pas
 * écraser le champ de saisie du numéro à côté — c'est le standard (WhatsApp,
 * formulaires internationaux). Ouvert : liste complète avec drapeau + indicatif
 * + nom du pays, Côte d'Ivoire en tête puis ordre alphabétique, filtrable.
 */
export default function CountrySelect({
  value,
  onChange,
}: {
  value: Country
  onChange: (c: Country) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapRef = useRef<HTMLDivElement>(null)

  // Ferme le menu si on clique en dehors.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const filtered = query.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.dial.includes(query.replace(/\D/g, "")))
    : COUNTRIES

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      {/* Bouton replié : drapeau + indicatif uniquement (compact) */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery("") }}
        aria-label={`Indicatif pays : ${value.name} (${value.dial})`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 cursor-pointer flex items-center justify-between gap-1 whitespace-nowrap"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none">{flagEmoji(value.iso)}</span>
          <span className="font-medium text-gray-800">{value.dial}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Champ de recherche */}
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un pays…"
              className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
            />
          </div>
          {/* Liste */}
          <ul role="listbox" className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">Aucun pays trouvé.</li>
            )}
            {filtered.map(c => {
              const active = c.iso === value.iso && c.dial === value.dial && c.name === value.name
              return (
                <li key={`${c.iso}-${c.dial}-${c.name}`}>
                  <button
                    type="button"
                    onClick={() => { onChange(c); setOpen(false); setQuery("") }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors ${active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
                  >
                    <span className="text-base leading-none flex-shrink-0">{flagEmoji(c.iso)}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-gray-400 text-xs flex-shrink-0">{c.dial}</span>
                    {active && <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
