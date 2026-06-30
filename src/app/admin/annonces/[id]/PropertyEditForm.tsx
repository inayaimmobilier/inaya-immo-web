"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, X, Save, CheckCircle, XCircle, Clock, RefreshCw, Trash2 } from "lucide-react"
import { updateProperty, changeStatut, deleteProperty } from "./actions"

const TYPE_OPTIONS = [
  { value: "location", label: "Location" },
  { value: "vente",    label: "Vente" },
  { value: "cession",  label: "Cession de biens" },
  { value: "residence_meublee", label: "Résidence meublée" },
]
const CATEGORIE_OPTIONS = [
  { value: "maison", label: "Maison" },
  { value: "appartement", label: "Appartement" },
  { value: "studio", label: "Studio" },
  { value: "terrain", label: "Terrain" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "bureau", label: "Bureau" },
  { value: "magasin", label: "Magasin" },
  { value: "autre", label: "Autre" },
]

interface Props {
  propertyId: string
  initial: {
    titre: string
    description: string | null
    type_offre: string
    categorie: string
    prix: number
    prix_m2: number | null
    quartier: string | null
    ville: string
    statut: string
    mois_caution: number | null
    mois_avance: number | null
    mois_agence: number | null
    cout_cession: number | null
    loyer_cession: number | null
    conditions_acquisition: string | null
    tarif_periode: string | null
    forfaits: string | null
  }
}

const STATUS_ACTIONS = [
  { statut: "publie",               label: "Publier",      Icon: CheckCircle, cls: "bg-green-600 hover:bg-green-700 text-white" },
  { statut: "en_attente_validation",label: "En attente",   Icon: Clock,       cls: "bg-amber-500 hover:bg-amber-600 text-white" },
  { statut: "rejete",               label: "Rejeter",      Icon: XCircle,     cls: "bg-red-600 hover:bg-red-700 text-white" },
  { statut: "suspendu",             label: "Suspendre",    Icon: X,           cls: "bg-gray-500 hover:bg-gray-600 text-white" },
]

export default function PropertyEditForm({ propertyId, initial }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [statusLoading, setStatusLoading] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState(initial.type_offre)
  const [selectedCategorie, setSelectedCategorie] = useState(initial.categorie)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()

  function onDelete() {
    setDeleteErr(null)
    startDelete(async () => {
      const res = await deleteProperty(propertyId)
      if (res.ok) router.push("/admin/annonces")
      else setDeleteErr(res.error)
    })
  }

  const updateWithId = updateProperty.bind(null, propertyId)
  const [state, formAction, pending] = useActionState(updateWithId, null)

  if (state?.ok && editing) setEditing(false)

  async function handleStatut(statut: string) {
    setStatusLoading(statut)
    setStatusMsg(null)
    const res = await changeStatut(propertyId, statut)
    setStatusLoading(null)
    if (res?.error) setStatusMsg(`Erreur : ${res.error}`)
    else setStatusMsg("Statut mis à jour")
    setTimeout(() => setStatusMsg(null), 3000)
  }

  return (
    <div className="space-y-4">
      {/* Bandeau changement de statut */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Changer le statut</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_ACTIONS.filter(s => s.statut !== initial.statut).map(({ statut, label, Icon, cls }) => (
            <button key={statut} onClick={() => handleStatut(statut)}
              disabled={statusLoading !== null}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${cls}`}>
              {statusLoading === statut
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Icon className="w-3.5 h-3.5" />}
              {label}
            </button>
          ))}
        </div>
        {statusMsg && (
          <p className="text-xs text-green-700 mt-2">{statusMsg}</p>
        )}
      </div>

      {/* Formulaire d'édition */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Données de l&apos;annonce</h2>
          {!editing ? (
            <button onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
          ) : (
            <button onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <X className="w-3.5 h-3.5" /> Annuler
            </button>
          )}
        </div>

        {!editing ? (
          /* Vue lecture */
          <dl className="divide-y divide-gray-50">
            {[
              { label: "Titre",       value: initial.titre },
              { label: "Type",        value: TYPE_OPTIONS.find(o => o.value === initial.type_offre)?.label ?? initial.type_offre },
              { label: "Catégorie",   value: CATEGORIE_OPTIONS.find(o => o.value === initial.categorie)?.label ?? initial.categorie },
              { label: initial.type_offre === "cession" ? "Coût cession" : "Prix",
                value: `${initial.prix.toLocaleString("fr-FR")} FCFA${initial.type_offre === "location" ? "/mois" : ""}` },
              ...(initial.prix_m2 != null
                ? [{ label: "Prix au m²", value: `${initial.prix_m2.toLocaleString("fr-FR")} FCFA/m²` }]
                : []),
              { label: "Quartier",    value: initial.quartier ?? "—" },
              { label: "Ville",       value: initial.ville },
              { label: "Description", value: initial.description ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3 flex gap-4">
                <dt className="text-xs font-medium text-gray-400 w-28 flex-shrink-0 pt-0.5">{label}</dt>
                <dd className="text-sm text-gray-800 whitespace-pre-line">{value}</dd>
              </div>
            ))}
            {selectedType === "location" && (
              <div className="px-5 py-3 flex gap-4">
                <dt className="text-xs font-medium text-gray-400 w-28 flex-shrink-0 pt-0.5">Conditions</dt>
                <dd className="text-sm text-gray-800">
                  {[
                    initial.mois_caution != null && `${initial.mois_caution} mois caution`,
                    initial.mois_avance   != null && `${initial.mois_avance} mois avance`,
                    initial.mois_agence   != null && `${initial.mois_agence} mois agence`,
                  ].filter(Boolean).join(" · ") || "—"}
                </dd>
              </div>
            )}
            {initial.type_offre === "cession" && (
              <>
                <div className="px-5 py-3 flex gap-4">
                  <dt className="text-xs font-medium text-gray-400 w-28 flex-shrink-0 pt-0.5">Loyer/mois</dt>
                  <dd className="text-sm text-gray-800">
                    {initial.loyer_cession != null ? `${initial.loyer_cession.toLocaleString("fr-FR")} FCFA` : "—"}
                  </dd>
                </div>
                <div className="px-5 py-3 flex gap-4">
                  <dt className="text-xs font-medium text-gray-400 w-28 flex-shrink-0 pt-0.5">Conditions</dt>
                  <dd className="text-sm text-gray-800 whitespace-pre-line">
                    {initial.conditions_acquisition || "—"}
                  </dd>
                </div>
              </>
            )}
          </dl>
        ) : (
          /* Vue édition */
          <form action={formAction} className="p-5 space-y-4">
            {state?.error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{state.error}</p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
              <input name="titre" defaultValue={initial.titre} required
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
                <select name="type_offre" value={selectedType}
                  onChange={e => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50">
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie *</label>
                <select name="categorie" value={selectedCategorie}
                  onChange={e => setSelectedCategorie(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50">
                  {CATEGORIE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {selectedType === "cession" ? "Coût de cession (FCFA) *" : "Prix (FCFA) *"}
                </label>
                <input name="prix" type="number" defaultValue={initial.prix} required min={0}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quartier</label>
                <input name="quartier" defaultValue={initial.quartier ?? ""}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50" />
              </div>
            </div>

            {selectedCategorie === "terrain" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Prix au m² (FCFA){" "}
                  <span className="text-gray-400 font-normal">— si le terrain est vendu au mètre carré</span>
                </label>
                <input name="prix_m2" type="number" min={0}
                  defaultValue={initial.prix_m2 ?? ""}
                  placeholder="Ex : 15 000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50" />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ville *</label>
              <input name="ville" defaultValue={initial.ville}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea name="description" defaultValue={initial.description ?? ""} rows={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 resize-y" />
            </div>

            {selectedType === "location" && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Conditions de location{" "}
                  <span className="text-gray-400 font-normal">(format "221" = 2 caution, 2 avance, 1 agence)</span>
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: "mois_caution", label: "Mois caution", val: initial.mois_caution },
                    { name: "mois_avance",  label: "Mois avance",  val: initial.mois_avance  },
                    { name: "mois_agence",  label: "Mois agence",  val: initial.mois_agence  },
                  ].map(({ name, label, val }) => (
                    <div key={name}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input name={name} type="number" min={0} max={12}
                        defaultValue={val ?? ""}
                        placeholder="—"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedType === "cession" && (
              <div className="space-y-3 border border-purple-100 bg-purple-50/40 rounded-xl p-4">
                <p className="text-xs font-medium text-purple-700 mb-1">Conditions de cession</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Loyer mensuel (FCFA)</label>
                    <input name="loyer_cession" type="number" min={0}
                      defaultValue={initial.loyer_cession ?? ""}
                      placeholder="Ex : 80 000"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Coût cession initial (FCFA)</label>
                    <input name="cout_cession" type="number" min={0}
                      defaultValue={initial.cout_cession ?? ""}
                      placeholder="Ex : 1 000 000"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Conditions d&apos;acquisition (libre)</label>
                  <textarea name="conditions_acquisition" rows={3}
                    defaultValue={initial.conditions_acquisition ?? ""}
                    placeholder="Ex : Matériel inclus, activité maintenue, durée bail restante 3 ans…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white resize-y" />
                </div>
              </div>
            )}

            {selectedType === "residence_meublee" && (
              <div className="space-y-3 border border-teal-100 bg-teal-50/40 rounded-xl p-4">
                <p className="text-xs font-medium text-teal-700">Résidence meublée</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tarif par</label>
                    <select name="tarif_periode" defaultValue={initial.tarif_periode ?? "nuit"}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 bg-white">
                      <option value="nuit">Nuit</option>
                      <option value="semaine">Semaine</option>
                      <option value="mois">Mois</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Forfaits spéciaux</label>
                  <textarea name="forfaits" rows={3} defaultValue={initial.forfaits ?? ""}
                    placeholder="Ex : 3 nuits à 30 000 FCFA · 10 000 FCFA/nuit à partir de 3 nuits…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 bg-white resize-y" />
                </div>
              </div>
            )}

            <button type="submit" disabled={pending}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
              {pending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {pending ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </form>
        )}
      </div>

      {/* Zone de danger : suppression définitive */}
      <div className="bg-white rounded-2xl border border-red-100 px-5 py-4">
        <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Zone de danger</p>
        <p className="text-xs text-gray-500 mb-3">
          Supprimer définitivement cette annonce (photos, vidéos et demandes liées). Action irréversible.
          Pour retirer temporairement l&apos;annonce, utilisez plutôt « Suspendre ».
        </p>
        {deleteErr && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{deleteErr}</p>
        )}
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Supprimer l&apos;annonce
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-700">Confirmer la suppression définitive ?</span>
            <button onClick={onDelete} disabled={deleting}
              className="inline-flex items-center gap-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl transition-colors disabled:opacity-60">
              {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Oui, supprimer
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
