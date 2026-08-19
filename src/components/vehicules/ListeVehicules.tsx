"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Car, Search, Pencil, Trash2, Eye, EyeOff, Archive } from "lucide-react"
import { STATUTS_VEHICULE, TYPES_VEHICULE } from "@/lib/vehicules"
import { publierVehicule, supprimerVehicule, changerStatutVehicule } from "@/app/admin/vehicules/actions"
import type { VehiculeListe } from "@/lib/vehicules-serveur"

/**
 * Liste de flotte, partagée par l'administration et l'espace loueur.
 * `base` porte le préfixe des liens : les deux espaces ont les mêmes fiches
 * mais pas les mêmes adresses.
 */
export default function ListeVehicules(
  { vehicules, base, montrerLoueur = false }: {
    vehicules: VehiculeListe[]; base: string; montrerLoueur?: boolean
  },
) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState("")
  const [filtre, setFiltre] = useState("tous")
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const liste = useMemo(() => {
    const r = q.trim().toLowerCase()
    return vehicules.filter(v => {
      if (filtre === "publies" && !v.publie) return false
      if (filtre === "brouillons" && v.publie) return false
      if (filtre !== "tous" && filtre !== "publies" && filtre !== "brouillons"
          && v.statut !== filtre) return false
      if (!r) return true
      return [v.marque, v.modele, v.immatriculation ?? "", v.loueur_nom, String(v.reference ?? "")]
        .some(x => x.toLowerCase().includes(r))
    })
  }, [vehicules, q, filtre])

  const agir = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErreur(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setErreur(r.error ?? "Échec."); return }
      setConfirm(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Marque, modèle, immatriculation…"
            className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 w-72" />
        </div>
        {[["tous", "Tous"], ["publies", "En ligne"], ["brouillons", "Hors ligne"],
          ["disponible", "Disponibles"], ["loue", "Loués"],
          ["maintenance", "Maintenance"], ["archive", "Archivés"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              filtre === v ? "bg-blue-600 text-white border-blue-600"
                           : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{erreur}</p>
      )}

      {liste.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <Car className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Aucun véhicule.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {liste.map(v => {
            const st = STATUTS_VEHICULE[v.statut] ?? STATUTS_VEHICULE.indisponible
            return (
              <div key={v.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="h-36 bg-gray-100 flex items-center justify-center">
                  {v.photo
                    // Image distante d'origine libre : `next/image` exigerait de
                    // déclarer chaque domaine, ce qui casserait dès qu'un loueur
                    // héberge ailleurs.
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={v.photo} alt={`${v.marque} ${v.modele}`} className="w-full h-full object-cover" />
                    : <Car className="w-8 h-8 text-gray-300" />}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {v.marque} {v.modele}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {TYPES_VEHICULE.find(t => t.v === v.type_vehicule)?.l ?? v.type_vehicule}
                        {v.immatriculation ? ` · ${v.immatriculation}` : ""}
                        {v.reference ? ` · N° ${v.reference}` : ""}
                      </p>
                      {montrerLoueur && (
                        <p className="text-xs text-gray-400 mt-0.5">{v.loueur_nom}</p>
                      )}
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium shrink-0 ${st.cls}`}>
                      {st.l}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">
                      {v.prix_jour ? `${v.prix_jour.toLocaleString("fr-FR")} F/jour` :
                        <span className="text-amber-600 text-xs font-medium">Tarif à définir</span>}
                    </p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-lg ${
                      v.publie ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {v.publie ? "En ligne" : "Hors ligne"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 pt-1 border-t border-gray-50">
                    <Link href={`${base}/${v.id}`}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" title="Modifier">
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button onClick={() => agir(() => publierVehicule(v.id, !v.publie))}
                      disabled={pending} title={v.publie ? "Retirer du catalogue" : "Publier"}
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                      {v.publie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {v.statut !== "archive" && (
                      <button onClick={() => agir(() => changerStatutVehicule(v.id, "archive"))}
                        disabled={pending} title="Archiver"
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => setConfirm(v.id)} title="Supprimer"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 ml-auto">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {confirm === v.id && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-red-800">
                        Supprimer définitivement {v.marque} {v.modele} ?
                        L&apos;archivage est réversible, pas la suppression.
                      </p>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setConfirm(null)} className="px-3 py-1 text-xs text-gray-600">
                          Annuler
                        </button>
                        <button onClick={() => agir(() => supprimerVehicule(v.id))} disabled={pending}
                          className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-lg">
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
