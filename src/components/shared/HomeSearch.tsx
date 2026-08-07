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
  // PLUSIEURS communes : « un terrain à Bouaké ou Yamoussoukro » est une
  // demande courante. Limiter à une seule obligeait à lancer deux recherches
  // et à comparer deux listes de tête.
  const [villeIds, setVilleIds] = useState<string[]>([])
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

  // Quartiers de TOUTES les communes retenues. L'API n'en prend qu'une à la
  // fois et met ses réponses en cache : quelques requêtes courtes valent mieux
  // qu'un point d'entrée de plus à maintenir.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (villeIds.length === 0) { if (!cancelled) setQuartiers([]); return }
      try {
        const lots = await Promise.all(villeIds.map(id =>
          fetch(`/api/zones/quartiers?ville_id=${id}`).then(r => r.json()).catch(() => [])))
        // Le même nom de quartier peut exister dans deux communes : on
        // dédoublonne par NOM, puisque c'est le nom qui part dans la recherche.
        const vus = new Set<string>()
        const fusion: Zone[] = []
        for (const lot of lots as Zone[][]) {
          for (const q of Array.isArray(lot) ? lot : []) {
            if (q?.nom && !vus.has(q.nom)) { vus.add(q.nom); fusion.push(q) }
          }
        }
        if (cancelled) return
        setQuartiers(fusion)
        // ÉLAGAGE : on retire les quartiers sélectionnés qui n'appartiennent
        // plus à aucune commune retenue. Sans cela, retirer une commune
        // laisserait sa recherche viser un quartier devenu hors périmètre —
        // et aucun bien ne remonterait, sans que rien ne l'explique.
        setSelQuartiers(prev => prev.filter(n => vus.has(n)))
      } catch { if (!cancelled) setQuartiers([]) }
    }
    void load()
    return () => { cancelled = true }
  }, [villeIds])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (type) p.set("type", type)
    const nomsVilles = villeIds
      .map(id => villes.find(v => v.id === id)?.nom)
      .filter((n): n is string => !!n)
    if (nomsVilles.length) p.set("ville", nomsVilles.join(","))
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
          {/* LE TYPE DE BIEN D'ABORD.
              On cherche « un terrain », puis on dit où — pas l'inverse. Placer
              la commune en tête obligeait à choisir un lieu avant de savoir ce
              qu'on cherchait, et c'est aussi le type qui décide des filtres
              suivants : surface et usage pour un terrain, nombre de pièces
              sinon. */}
          <MultiSelect
            placeholder="Type de bien"
            options={cats}
            selected={selCats}
            onChange={setSelCats}
            className="flex-1 min-w-0 border-r border-gray-100"
            buttonClass="px-4 py-4 text-sm text-gray-600 bg-white"
          />

          {/* Communes (plusieurs) */}
          <MultiSelect
            placeholder="Toutes les communes"
            options={villes.map(v => ({ value: v.id, label: v.nom }))}
            selected={villeIds}
            onChange={setVilleIds}
            className="flex-1 min-w-0 border-r border-gray-100"
            buttonClass="px-4 py-4 text-sm text-gray-600 bg-white"
          />

          {/* Quartiers (plusieurs), dépendants des communes retenues */}
          <MultiSelect
            placeholder={villeIds.length === 0 ? "Choisissez une commune" : "Tous les quartiers"}
            options={quartiers.map(q => ({ value: q.nom, label: q.nom }))}
            selected={selQuartiers}
            onChange={setSelQuartiers}
            disabled={quartiers.length === 0}
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
