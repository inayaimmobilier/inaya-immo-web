"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Search, SlidersHorizontal } from "lucide-react"

const CATEGORIES = [
  { value: "", label: "Tous types" },
  { value: "maison", label: "Maison" },
  { value: "appartement", label: "Appartement" },
  { value: "studio", label: "Studio" },
  { value: "terrain", label: "Terrain" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "bureau", label: "Bureau" },
  { value: "magasin", label: "Magasin" },
]

const PRIX_MAX = [
  { value: "", label: "Budget libre" },
  { value: "50000",   label: "≤ 50 000 FCFA" },
  { value: "100000",  label: "≤ 100 000 FCFA" },
  { value: "200000",  label: "≤ 200 000 FCFA" },
  { value: "500000",  label: "≤ 500 000 FCFA" },
  { value: "1000000", label: "≤ 1 000 000 FCFA" },
]

const PIECES_MIN = [
  { value: "", label: "Toutes pièces" },
  { value: "1", label: "1 pièce min" },
  { value: "2", label: "2 pièces min" },
  { value: "3", label: "3 pièces min" },
  { value: "4", label: "4 pièces min" },
  { value: "5", label: "5 pièces min" },
]

interface Zone { id: string; nom: string }

const cls = "px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

export default function PropertyFilters() {
  const router = useRouter()
  const params = useSearchParams()

  const [quartiers, setQuartiers] = useState<Zone[]>([])

  // Charge les quartiers depuis l'API publique (toutes les villes confondues pour simplifier)
  useEffect(() => {
    fetch("/api/zones/quartiers")
      .then(r => r.json())
      .then(d => setQuartiers(d as Zone[]))
      .catch(() => {})
  }, [])

  const update = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(params.toString())
      // Purge les anciens params HomeSearch (UUID) quand on utilise les filtres texte
      p.delete("ville_id"); p.delete("quartier_id")
      if (value) p.set(key, value)
      else p.delete(key)
      p.delete("page")
      router.push(`/biens?${p.toString()}`)
    },
    [params, router]
  )

  // Résout le quartier affiché : soit depuis "quartier" (nom), soit depuis "quartier_id" (UUID→nom)
  const quartierValue = params.get("quartier") || ""

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-blue-700" />
        <span className="text-sm font-semibold text-gray-900">Filtres</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Type opération */}
        <select value={params.get("type") || ""} onChange={e => update("type", e.target.value)} className={cls}>
          <option value="">Tous types</option>
          <option value="location">Location</option>
          <option value="vente">Vente</option>
          <option value="cession">Cession</option>
        </select>

        {/* Catégorie */}
        <select value={params.get("categorie") || ""} onChange={e => update("categorie", e.target.value)} className={cls}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {/* Quartier */}
        <select value={quartierValue} onChange={e => update("quartier", e.target.value)} className={cls}>
          <option value="">Tous les quartiers</option>
          {quartiers.map(q => <option key={q.id} value={q.nom}>{q.nom}</option>)}
        </select>

        {/* Pièces min */}
        <select value={params.get("pieces_min") || ""} onChange={e => update("pieces_min", e.target.value)} className={cls}>
          {PIECES_MIN.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {/* Budget max */}
        <select value={params.get("prix_max") || ""} onChange={e => update("prix_max", e.target.value)} className={cls}>
          {PRIX_MAX.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {/* Recherche texte */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher…"
            defaultValue={params.get("q") || ""}
            onKeyDown={e => {
              if (e.key === "Enter") update("q", (e.target as HTMLInputElement).value)
            }}
            className={`w-full pl-9 pr-3 ${cls}`}
          />
        </div>
      </div>
    </div>
  )
}
