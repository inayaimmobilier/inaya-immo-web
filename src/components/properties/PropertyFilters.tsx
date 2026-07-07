"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react"

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

const PIECES_MIN = [
  { value: "", label: "Toutes pièces" },
  { value: "1", label: "1 pièce min" },
  { value: "2", label: "2 pièces min" },
  { value: "3", label: "3 pièces min" },
  { value: "4", label: "4 pièces min" },
  { value: "5", label: "5 pièces min" },
]

interface Zone { id: string; nom: string }

const selectCls = "w-full pl-3 pr-8 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
const inputCls = "w-full pl-3 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400"

export default function PropertyFilters() {
  const router = useRouter()
  const params = useSearchParams()

  const [communes, setCommunes] = useState<Zone[]>([])
  const [quartiers, setQuartiers] = useState<Zone[]>([])
  const [open, setOpen] = useState(false)

  // Charge les communes (villes).
  useEffect(() => {
    fetch("/api/zones/villes").then(r => r.json()).then(d => setCommunes(d as Zone[])).catch(() => {})
  }, [])

  const communeValue = params.get("ville") || communes.find(v => v.id === params.get("ville_id"))?.nom || ""
  const selectedVilleId = params.get("ville_id") || communes.find(v => v.nom === communeValue)?.id || ""

  useEffect(() => {
    const url = selectedVilleId ? `/api/zones/quartiers?ville_id=${selectedVilleId}` : "/api/zones/quartiers"
    fetch(url).then(r => r.json()).then(d => setQuartiers(d as Zone[])).catch(() => {})
  }, [selectedVilleId])

  const update = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(params.toString())
      const qid = p.get("quartier_id")
      if (qid && !p.get("quartier")) {
        const nom = quartiers.find(q => q.id === qid)?.nom
        if (nom) p.set("quartier", nom)
      }
      p.delete("quartier_id")
      const vid = p.get("ville_id")
      if (vid && !p.get("ville")) {
        const nom = communes.find(v => v.id === vid)?.nom
        if (nom) p.set("ville", nom)
      }
      p.delete("ville_id")

      if (value) p.set(key, value)
      else p.delete(key)
      if (key === "ville") p.delete("quartier")
      p.delete("page")
      router.push(`/biens?${p.toString()}`)
    },
    [params, router, quartiers, communes]
  )

  const quartierValue = params.get("quartier") || quartiers.find(q => q.id === params.get("quartier_id"))?.nom || ""
  const activeCount = [params.get("type"), params.get("categorie"), communeValue, quartierValue, params.get("pieces_min"), params.get("prix_max"), params.get("q")].filter(Boolean).length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header avec toggle mobile */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 md:cursor-default"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-700" />
          <span className="text-sm font-semibold text-gray-900">Filtres</span>
          {activeCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {activeCount}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform md:hidden ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Grille filtres */}
      <div className={`px-4 pb-4 space-y-3 ${open ? "block" : "hidden"} md:block`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Type opération */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select value={params.get("type") || ""} onChange={e => update("type", e.target.value)} className={selectCls}>
              <option value="">Tous types</option>
              <option value="location">📍 Location</option>
              <option value="vente">🏷️ Vente</option>
              <option value="cession">🔄 Cession</option>
            </select>
          </div>

          {/* Catégorie */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
            <select value={params.get("categorie") || ""} onChange={e => update("categorie", e.target.value)} className={selectCls}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Commune */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Commune</label>
            <select value={communeValue} onChange={e => update("ville", e.target.value)} className={selectCls}>
              <option value="">Toutes les communes</option>
              {communes.map(v => <option key={v.id} value={v.nom}>{v.nom}</option>)}
            </select>
          </div>

          {/* Quartier */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Quartier</label>
            <select value={quartierValue} onChange={e => update("quartier", e.target.value)} className={selectCls}>
              <option value="">Tous les quartiers</option>
              {quartiers.map(q => <option key={q.id} value={q.nom}>{q.nom}</option>)}
            </select>
          </div>

          {/* Pièces min */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Pièces min.</label>
            <select value={params.get("pieces_min") || ""} onChange={e => update("pieces_min", e.target.value)} className={selectCls}>
              {PIECES_MIN.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Budget max */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Budget max</label>
            <input
              key={params.get("prix_max") || "budget"}
              type="number" min={0} inputMode="numeric"
              placeholder="Ex: 100 000 FCFA"
              defaultValue={params.get("prix_max") || ""}
              onKeyDown={e => { if (e.key === "Enter") update("prix_max", (e.target as HTMLInputElement).value.trim()) }}
              onBlur={e => { const v = e.target.value.trim(); if (v !== (params.get("prix_max") || "")) update("prix_max", v) }}
              className={inputCls}
            />
          </div>

          {/* Recherche texte */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Mot-clé, quartier..."
                defaultValue={params.get("q") || ""}
                onKeyDown={e => {
                  if (e.key === "Enter") update("q", (e.target as HTMLInputElement).value)
                }}
                className={`pl-9 pr-3 ${inputCls}`}
              />
            </div>
          </div>

          {/* Bouton Rechercher (mobile) */}
          <div className="flex items-end sm:hidden">
            <button
              onClick={() => setOpen(false)}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Appliquer les filtres
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
