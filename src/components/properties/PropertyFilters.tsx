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

  const [communes, setCommunes] = useState<Zone[]>([])
  const [quartiers, setQuartiers] = useState<Zone[]>([])

  // Charge les communes (villes).
  useEffect(() => {
    fetch("/api/zones/villes").then(r => r.json()).then(d => setCommunes(d as Zone[])).catch(() => {})
  }, [])

  // Commune sélectionnée : nom depuis "ville" ou résolu depuis "ville_id" (UUID→nom).
  const communeValue = params.get("ville") || communes.find(v => v.id === params.get("ville_id"))?.nom || ""
  const selectedVilleId = params.get("ville_id") || communes.find(v => v.nom === communeValue)?.id || ""

  // Charge les quartiers de la commune sélectionnée (ou tous si aucune commune).
  useEffect(() => {
    const url = selectedVilleId ? `/api/zones/quartiers?ville_id=${selectedVilleId}` : "/api/zones/quartiers"
    fetch(url).then(r => r.json()).then(d => setQuartiers(d as Zone[])).catch(() => {})
  }, [selectedVilleId])

  const update = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(params.toString())
      // Convertit les UUID venus de l'accueil en noms AVANT toute modification,
      // sinon les filtres commune/quartier seraient perdus.
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
      // Changer de commune réinitialise le quartier (il appartenait à l'ancienne).
      if (key === "ville") p.delete("quartier")
      p.delete("page")
      router.push(`/biens?${p.toString()}`)
    },
    [params, router, quartiers, communes]
  )

  const quartierValue = params.get("quartier") || quartiers.find(q => q.id === params.get("quartier_id"))?.nom || ""

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-blue-700" />
        <span className="text-sm font-semibold text-gray-900">Filtres</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
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

        {/* Commune */}
        <select value={communeValue} onChange={e => update("ville", e.target.value)} className={cls}>
          <option value="">Toutes les communes</option>
          {communes.map(v => <option key={v.id} value={v.nom}>{v.nom}</option>)}
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
