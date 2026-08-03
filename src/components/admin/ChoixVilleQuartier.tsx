"use client"

import { useEffect, useState } from "react"

// ============================================================================
// VILLE puis QUARTIER, choisis dans le référentiel — pour UNE annonce.
//
// Les deux champs étaient de la saisie libre. Sur des annonces ingérées des
// groupes WhatsApp, cela produisait des orthographes divergentes du même
// lieu — « ahougnassou » et « Ahougnassou », « Tollakouadiokro » et
// « Tolakouadiokro ». Le rapprochement offre↔demande compare ces chaînes :
// deux graphies d'un même quartier deviennent deux quartiers, et le bien
// n'atteint jamais la personne qui le cherche.
//
// La liste des quartiers dépend de la ville choisie : « Kokrenou » existe à
// Bouaké ET à Yamoussoukro, une liste à plat ne dirait pas lequel on retient.
//
// Variante à sélection UNIQUE, distincte de `SelecteurLieux` (multi-choix, pour
// les demandes) : une annonce est à un seul endroit, une recherche peut viser
// plusieurs quartiers.
// ============================================================================

interface ZoneOpt { id: string; nom: string }

const champ =
  "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50"

export default function ChoixVilleQuartier({
  villeInitiale, quartierInitial,
}: {
  villeInitiale: string
  quartierInitial: string
}) {
  const [villes, setVilles] = useState<ZoneOpt[]>([])
  const [quartiers, setQuartiers] = useState<ZoneOpt[]>([])
  const [ville, setVille] = useState(villeInitiale ?? "")
  const [quartier, setQuartier] = useState(quartierInitial ?? "")

  useEffect(() => {
    fetch("/api/zones/villes").then(r => r.json())
      .then((d: ZoneOpt[]) => { if (Array.isArray(d)) setVilles(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const v = villes.find(x => x.nom === ville)
    if (!v) { setQuartiers([]); return }
    fetch(`/api/zones/quartiers?ville_id=${v.id}`).then(r => r.json())
      .then((d: ZoneOpt[]) => { if (Array.isArray(d)) setQuartiers(d) })
      .catch(() => setQuartiers([]))
  }, [ville, villes])

  // La ville existante peut ne pas figurer au référentiel (annonce ancienne ou
  // ingérée). On l'ajoute à la liste plutôt que de la faire disparaître au
  // premier affichage : effacer silencieusement une donnée serait pire que de
  // proposer une valeur hors liste.
  const optionsVilles = villes.some(v => v.nom === ville) || !ville
    ? villes : [{ id: "__initiale", nom: ville }, ...villes]
  const optionsQuartiers = quartiers.some(q => q.nom === quartier) || !quartier
    ? quartiers : [{ id: "__initial", nom: quartier }, ...quartiers]

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ville *</label>
        <select
          name="ville" required value={ville} className={champ}
          onChange={e => {
            setVille(e.target.value)
            // Changer de ville invalide le quartier : le garder placerait le
            // bien dans un quartier qui n'appartient pas à sa commune.
            setQuartier("")
          }}
        >
          <option value="">— choisir une ville —</option>
          {optionsVilles.map(v => <option key={v.id} value={v.nom}>{v.nom}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Quartier</label>
        <select
          name="quartier" value={quartier} className={champ}
          onChange={e => setQuartier(e.target.value)}
          disabled={!ville}
        >
          <option value="">
            {ville ? "— choisir un quartier —" : "Choisissez d'abord la ville"}
          </option>
          {optionsQuartiers.map(q => <option key={q.id} value={q.nom}>{q.nom}</option>)}
        </select>
        {ville && quartiers.length === 0 && (
          <p className="mt-1 text-[11px] text-gray-400">
            Aucun quartier au référentiel pour cette ville — ajoutez-les dans Zones.
          </p>
        )}
      </div>
    </>
  )
}
