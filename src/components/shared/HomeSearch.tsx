"use client"

import { useState, useEffect } from "react"
import { TRANCHES_SURFACE } from "@/lib/terrain"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import MultiSelect from "@/components/shared/MultiSelect"
import { DEFAULT_PROPERTY_TYPES } from "@/lib/property-types"
import { fbTrack } from "@/lib/analytics"

interface Zone { id: string; nom: string }

const DEFAULT_CATS = DEFAULT_PROPERTY_TYPES.map(t => ({ value: t.code, label: t.label }))

type TypeOffre = "" | "location" | "vente"

const selectCls = "flex-1 min-w-0 px-4 py-4 text-sm text-gray-600 border-r border-gray-100 outline-none bg-white last:border-r-0"

export default function HomeSearch({ villes }: { villes: Zone[] }) {
  const router = useRouter()
  const [type, setType] = useState<TypeOffre>("")
  const [villeId, setVilleId] = useState("")   // « Toutes les communes » par défaut (évite un filtre commune involontaire)
  const [quartiers, setQuartiers] = useState<Zone[]>([])
  const [selQuartiers, setSelQuartiers] = useState<string[]>([])
  const [selCats, setSelCats] = useState<string[]>([])
  const [cats, setCats] = useState(DEFAULT_CATS)
  const [piecesMin, setPiecesMin] = useState("")
  // Filtres propres au TERRAIN : le nombre de pièces n'y veut rien dire. Ce
  // sont la surface et l'usage qui séparent le lot à bâtir de 500 m² de la
  // plantation de plusieurs hectares — deux marchés sans rapport, mesurés à
  // 515 lots contre 72 parcelles d'un hectare et plus.
  const [trancheSurface, setTrancheSurface] = useState("")
  const [usage, setUsage] = useState("")
  const terrainSeul = selCats.length > 0 && selCats.every(c => c === "terrain")
  const [prixMax, setPrixMax] = useState("")

  // Liste des types de biens gérée par l'admin (repli sur DEFAULT_CATS si indispo).
  useEffect(() => {
    let cancelled = false
    fetch("/api/property-types")
      .then(r => r.json())
      .then((d: { code: string; label: string }[]) => {
        if (!cancelled && Array.isArray(d) && d.length) setCats(d.map(t => ({ value: t.code, label: t.label })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Charge les quartiers de la commune choisie (la sélection est réinitialisée dans
  // le onChange de la commune). Tout setState se fait de façon asynchrone.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!villeId) { if (!cancelled) setQuartiers([]); return }
      try {
        const r = await fetch(`/api/zones/quartiers?ville_id=${villeId}`)
        const data = (await r.json()) as Zone[]
        if (!cancelled) setQuartiers(data)
      } catch { if (!cancelled) setQuartiers([]) }
    }
    void load()
    return () => { cancelled = true }
  }, [villeId])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (type) p.set("type", type)
    const villeNom = villes.find(v => v.id === villeId)?.nom
    if (villeNom) p.set("ville", villeNom)
    if (selQuartiers.length) p.set("quartier", selQuartiers.join(","))
    if (selCats.length) p.set("categorie", selCats.join(","))
    if (piecesMin && !terrainSeul) p.set("pieces_min", piecesMin)
    if (terrainSeul && trancheSurface) p.set("surface", trancheSurface)
    if (terrainSeul && usage) p.set("usage", usage)
    if (prixMax.trim()) p.set("prix_max", prixMax.trim())
    fbTrack("Search", { search_string: p.toString(), content_category: type || undefined })
    router.push(`/biens?${p.toString()}`)
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl shadow-black/50 max-w-3xl overflow-hidden">
      {/* Onglets type */}
      <div className="flex border-b border-gray-100">
        {(["", "location", "vente"] as TypeOffre[]).map((t, i) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`flex-1 py-3.5 text-sm font-bold transition-colors border-b-2 ${
              type === t ? "border-blue-700 text-blue-700 bg-blue-50/60" : "border-transparent text-gray-700 hover:text-blue-700 hover:bg-gray-50"
            }`}>
            {["Tout", "Location", "Vente"][i]}
          </button>
        ))}
      </div>

      {/* Champs */}
      <form onSubmit={submit}>
        <div className="flex flex-col sm:flex-row flex-wrap border-b border-gray-100">
          {/* Commune (une seule) */}
          <select value={villeId} onChange={e => { setVilleId(e.target.value); setSelQuartiers([]) }} className={selectCls}>
            <option value="">Toutes les communes</option>
            {villes.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </select>

          {/* Quartiers (plusieurs) */}
          <MultiSelect
            placeholder="Tous les quartiers"
            options={quartiers.map(q => ({ value: q.nom, label: q.nom }))}
            selected={selQuartiers}
            onChange={setSelQuartiers}
            disabled={quartiers.length === 0}
            className="flex-1 min-w-0 border-r border-gray-100"
            buttonClass="px-4 py-4 text-sm text-gray-600 bg-white"
          />

          {/* Types de biens (plusieurs) */}
          <MultiSelect
            placeholder="Type de bien"
            options={cats}
            selected={selCats}
            onChange={setSelCats}
            className="flex-1 min-w-0 border-r border-gray-100"
            buttonClass="px-4 py-4 text-sm text-gray-600 bg-white"
          />

          {/* Terrain : surface + usage. Sinon : nombre de pièces. */}
          {terrainSeul ? (
            <>
              <select value={trancheSurface} onChange={e => setTrancheSurface(e.target.value)} className={selectCls}>
                <option value="">Surface (toutes)</option>
                {TRANCHES_SURFACE.map(t => (
                  <option key={t.cle} value={t.cle}>{t.label}</option>
                ))}
              </select>
              <select value={usage} onChange={e => setUsage(e.target.value)} className={selectCls}>
                <option value="">Usage (tous)</option>
                <option value="habitation">Lot à bâtir</option>
                <option value="agricole">Agricole / plantation</option>
                <option value="commercial">Commercial / industriel</option>
              </select>
            </>
          ) : (
            <select value={piecesMin} onChange={e => setPiecesMin(e.target.value)} className={selectCls}>
              <option value="">Pièces (toutes)</option>
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n} pièce{n > 1 ? "s" : ""}{n === 5 ? " ou +" : " min"}</option>
              ))}
            </select>
          )}
        </div>

        {/* Budget (maximum uniquement) */}
        <div className="flex flex-col sm:flex-row items-stretch">
          <div className="flex flex-1 border-r border-gray-100">
            <span className="px-4 py-3.5 text-xs text-gray-400 flex items-center whitespace-nowrap">Budget max</span>
            <input type="number" min={0} value={prixMax} onChange={e => setPrixMax(e.target.value)} placeholder="Votre budget (FCFA)"
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
