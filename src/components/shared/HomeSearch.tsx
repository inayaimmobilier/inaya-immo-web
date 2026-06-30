"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"

interface Zone { id: string; nom: string }

const CATEGORIES = [
  { value: "maison", label: "Maison" },
  { value: "appartement", label: "Appartement" },
  { value: "studio", label: "Studio" },
  { value: "terrain", label: "Terrain" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "bureau", label: "Bureau" },
]

type TypeOffre = "" | "location" | "vente"

const selectCls = "flex-1 min-w-0 px-4 py-4 text-sm text-gray-600 border-r border-gray-100 outline-none bg-white last:border-r-0"

export default function HomeSearch({ villes }: { villes: Zone[] }) {
  const [type, setType] = useState<TypeOffre>("")
  const [villeId, setVilleId] = useState(villes[0]?.id ?? "")
  const [quartiers, setQuartiers] = useState<Zone[]>([])

  useEffect(() => {
    if (!villeId) { setQuartiers([]); return }
    fetch(`/api/zones/quartiers?ville_id=${villeId}`)
      .then(r => r.json())
      .then(data => setQuartiers(data as Zone[]))
      .catch(() => setQuartiers([]))
  }, [villeId])

  return (
    <div className="bg-white rounded-2xl shadow-2xl shadow-black/50 max-w-3xl overflow-hidden">
      {/* Onglets type */}
      <div className="flex border-b border-gray-100">
        {(["", "location", "vente"] as TypeOffre[]).map((t, i) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors border-b-2 ${
              type === t ? "border-blue-700 text-blue-700" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {["Tout", "Location", "Vente"][i]}
          </button>
        ))}
      </div>

      {/* Champs */}
      <form action="/biens" method="get">
        {type && <input type="hidden" name="type" value={type} />}

        <div className="flex flex-col sm:flex-row flex-wrap border-b border-gray-100">
          {/* Ville */}
          <select name="ville_id" value={villeId} onChange={e => setVilleId(e.target.value)}
            className={selectCls}>
            <option value="">Toutes les villes</option>
            {villes.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </select>

          {/* Quartier */}
          <select name="quartier_id" className={selectCls} disabled={quartiers.length === 0}>
            <option value="">Tous les quartiers</option>
            {quartiers.map(q => <option key={q.id} value={q.id}>{q.nom}</option>)}
          </select>

          {/* Type de bien */}
          <select name="categorie" className={selectCls}>
            <option value="">Type de bien</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {/* Nombre de pièces */}
          <select name="pieces_min" className={selectCls}>
            <option value="">Pièces (toutes)</option>
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{n} pièce{n > 1 ? "s" : ""}{n === 5 ? " ou +" : " min"}</option>
            ))}
          </select>
        </div>

        {/* Budget */}
        <div className="flex flex-col sm:flex-row items-stretch">
          <div className="flex flex-1 border-r border-gray-100">
            <span className="px-4 py-3.5 text-xs text-gray-400 flex items-center whitespace-nowrap">Budget min</span>
            <input type="number" name="prix_min" min={0} placeholder="0 FCFA"
              className="flex-1 py-3.5 pr-4 text-sm text-gray-700 outline-none bg-white placeholder:text-gray-300" />
          </div>
          <div className="flex flex-1 border-r border-gray-100">
            <span className="px-4 py-3.5 text-xs text-gray-400 flex items-center whitespace-nowrap">Budget max</span>
            <input type="number" name="prix_max" min={0} placeholder="Illimité"
              className="flex-1 py-3.5 pr-4 text-sm text-gray-700 outline-none bg-white placeholder:text-gray-300" />
          </div>
          <button type="submit"
            className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold px-7 py-3.5 text-sm transition-colors sm:rounded-none">
            <Search className="w-4 h-4" /> Rechercher
          </button>
        </div>
      </form>
    </div>
  )
}
