"use client"

import { useEffect, useState } from "react"
import { MapPin, X } from "lucide-react"

// ============================================================================
// CHOIX DES LIEUX : une ou PLUSIEURS communes, puis leurs quartiers.
//
// Saisir les quartiers à la main produisait des orthographes divergentes —
// « ahougnassou » et « Ahougnassou » cohabitaient dans la même demande, et le
// rapprochement les traitait comme deux lieux. On choisit donc dans le
// référentiel, qui fait foi.
//
// Plusieurs communes, parce que « à Bouaké ou Yamoussoukro » est une demande
// courante : la limiter à une seule obligerait le client à en créer deux, donc
// à recevoir deux fois chaque alerte.
//
// Les quartiers sont GROUPÉS PAR COMMUNE à l'affichage : « Kokrenou » existe
// dans les deux villes, et une liste à plat ne dirait pas lequel on coche.
// ============================================================================

interface ZoneOpt { id: string; nom: string }

export default function SelecteurLieux({
  communes, quartiers, onChange,
}: {
  communes: string[]
  quartiers: string[]
  onChange: (communes: string[], quartiers: string[]) => void
}) {
  const [villes, setVilles] = useState<ZoneOpt[]>([])
  const [parVille, setParVille] = useState<Record<string, ZoneOpt[]>>({})
  const [libre, setLibre] = useState("")

  useEffect(() => {
    fetch("/api/zones/villes").then(r => r.json())
      .then((d: ZoneOpt[]) => { if (Array.isArray(d)) setVilles(d) })
      .catch(() => {})
  }, [])

  // Un appel par commune sélectionnée. L'API ne prend qu'une ville à la fois et
  // met ses réponses en cache soixante secondes : quelques requêtes courtes
  // valent mieux qu'un endpoint de plus à maintenir.
  useEffect(() => {
    const manquantes = villes.filter(v => communes.includes(v.nom) && !parVille[v.id])
    if (manquantes.length === 0) return
    let annule = false
    Promise.all(manquantes.map(v =>
      fetch(`/api/zones/quartiers?ville_id=${v.id}`).then(r => r.json())
        .then((d: ZoneOpt[]) => [v.id, Array.isArray(d) ? d : []] as const)
        .catch(() => [v.id, [] as ZoneOpt[]] as const),
    )).then(res => {
      if (annule) return
      setParVille(p => ({ ...p, ...Object.fromEntries(res) }))
    })
    return () => { annule = true }
  }, [communes, villes, parVille])

  const basculerCommune = (nom: string) => {
    const dedans = communes.includes(nom)
    if (!dedans) return onChange([...communes, nom], quartiers)

    // En retirant une commune, on retire AUSSI ses quartiers : les laisser
    // produirait une demande visant un quartier hors de toute commune retenue,
    // que personne ne saurait interpréter.
    const ville = villes.find(v => v.nom === nom)
    const siens = new Set((ville ? parVille[ville.id] ?? [] : []).map(q => q.nom))
    onChange(communes.filter(c => c !== nom), quartiers.filter(q => !siens.has(q)))
  }

  const basculerQuartier = (nom: string) =>
    onChange(communes, quartiers.includes(nom)
      ? quartiers.filter(q => q !== nom) : [...quartiers, nom])

  const ajouterLibre = () => {
    const v = libre.trim()
    if (v && !quartiers.includes(v)) onChange(communes, [...quartiers, v])
    setLibre("")
  }

  const villesChoisies = villes.filter(v => communes.includes(v.nom))

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">
          Commune(s) — une ou plusieurs
        </label>
        <div className="flex flex-wrap gap-1.5">
          {villes.map(v => {
            const actif = communes.includes(v.nom)
            return (
              <button key={v.id} type="button" onClick={() => basculerCommune(v.nom)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  actif ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                {v.nom}
              </button>
            )
          })}
          {villes.length === 0 && (
            <span className="text-[11px] text-gray-400">Chargement des communes…</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">
          Quartier(s)
        </label>
        {villesChoisies.length === 0 ? (
          <p className="text-[11px] text-gray-400">
            Choisissez d&apos;abord une commune pour afficher ses quartiers.
          </p>
        ) : villesChoisies.map(v => (
          <div key={v.id} className="mb-2">
            {/* Le nom de la commune reste visible au-dessus de ses quartiers :
                « Kokrenou » existe à Bouaké ET à Yamoussoukro. */}
            {villesChoisies.length > 1 && (
              <p className="text-[11px] font-semibold text-gray-500 mb-1">{v.nom}</p>
            )}
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {(parVille[v.id] ?? []).map(q => {
                const actif = quartiers.includes(q.nom)
                return (
                  <button key={q.id} type="button" onClick={() => basculerQuartier(q.nom)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      actif ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                    {q.nom}
                  </button>
                )
              })}
              {(parVille[v.id]?.length ?? 0) === 0 && (
                <span className="text-[11px] text-gray-400">Aucun quartier au référentiel.</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {quartiers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quartiers.map(q => (
            <span key={q} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs text-blue-800">
              <MapPin className="w-3 h-3" /> {q}
              <button type="button" onClick={() => basculerQuartier(q)}
                title="Retirer ce quartier" className="hover:text-blue-950">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Le référentiel n'est jamais complet : sans cette porte de sortie, un
          quartier réel mais absent de la liste rendrait la demande invalidable. */}
      <div className="flex gap-2">
        <input value={libre} onChange={e => setLibre(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ajouterLibre() } }}
          placeholder="Autre quartier (hors liste)…"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        <button type="button" onClick={ajouterLibre}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Ajouter
        </button>
      </div>
    </div>
  )
}
