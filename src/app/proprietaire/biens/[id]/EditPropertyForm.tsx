"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertCircle, CheckCircle2, Trash2, Save } from "lucide-react"
import { updateMyProperty, deleteMyProperty } from "./actions"

const TYPE_OPTIONS = [
  { value: "location", label: "Location", desc: "Maison, studio, appartement…" },
  { value: "vente", label: "Vente", desc: "Terrain, maison, local…" },
  { value: "cession", label: "Cession", desc: "Fonds de commerce, bail à céder…" },
]
const CATEGORIES = [
  { value: "maison", label: "Maison" },
  { value: "appartement", label: "Appartement" },
  { value: "studio", label: "Studio" },
  { value: "terrain", label: "Terrain" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "bureau", label: "Bureau" },
  { value: "magasin", label: "Magasin" },
  { value: "autre", label: "Autre" },
]

const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
const labelCls = "block text-sm font-medium text-gray-700 mb-1.5"

export interface EditableProperty {
  id: string
  titre: string
  description: string | null
  type_offre: string
  categorie: string
  prix: number
  quartier: string | null
  ville: string
  mois_caution: number | null
  mois_avance: number | null
  mois_agence: number | null
  cout_cession: number | null
  loyer_cession: number | null
  conditions_acquisition: string | null
}

export default function EditPropertyForm({ property }: { property: EditableProperty }) {
  const router = useRouter()
  const [typeOffre, setTypeOffre] = useState(property.type_offre)
  const updateWithId = updateMyProperty.bind(null, property.id)
  const [state, action, pending] = useActionState(updateWithId, null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, startDelete] = useTransition()
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  function onDelete() {
    setDeleteErr(null)
    startDelete(async () => {
      const res = await deleteMyProperty(property.id)
      if (res.ok) router.push("/proprietaire/biens")
      else setDeleteErr(res.error)
    })
  }

  return (
    <div className="space-y-6">
      <form action={action} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        {state && "error" in state && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}
        {state && "ok" in state && state.ok && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-xl p-4">
            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-700">
              Modifications enregistrées. Votre annonce repasse en vérification avant d&apos;être republiée.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Type d&apos;annonce <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TYPE_OPTIONS.map(opt => (
              <label key={opt.value} className="relative cursor-pointer">
                <input type="radio" name="type_offre" value={opt.value} defaultChecked={opt.value === property.type_offre}
                  onChange={() => setTypeOffre(opt.value)} className="peer sr-only" required />
                <div className="border-2 border-gray-200 rounded-xl p-4 peer-checked:border-blue-600 peer-checked:bg-blue-50 transition-all">
                  <p className="font-semibold text-gray-900 text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="categorie" className={labelCls}>Catégorie du bien <span className="text-red-500">*</span></label>
          <select id="categorie" name="categorie" required defaultValue={property.categorie} className={inputCls}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="titre" className={labelCls}>Titre de l&apos;annonce <span className="text-red-500">*</span></label>
          <input id="titre" name="titre" type="text" required defaultValue={property.titre} maxLength={120} className={inputCls} />
        </div>

        <div>
          <label htmlFor="prix" className={labelCls}>Prix <span className="text-red-500">*</span></label>
          <div className="relative">
            <input id="prix" name="prix" type="number" min="0" required defaultValue={property.prix} className={`${inputCls} pr-16`} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">FCFA</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ville" className="block text-xs text-gray-500 mb-1">Commune</label>
            <input id="ville" name="ville" type="text" defaultValue={property.ville} className={inputCls} />
          </div>
          <div>
            <label htmlFor="quartier" className="block text-xs text-gray-500 mb-1">Quartier</label>
            <input id="quartier" name="quartier" type="text" defaultValue={property.quartier ?? ""} className={inputCls} />
          </div>
        </div>

        {typeOffre === "location" && (
          <div>
            <p className={labelCls}>Conditions de location <span className="text-gray-400 font-normal">(facultatif)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="mois_caution" className="block text-xs text-gray-500 mb-1">Caution (mois)</label>
                <input id="mois_caution" name="mois_caution" type="number" min="0" defaultValue={property.mois_caution ?? ""} className={inputCls} />
              </div>
              <div>
                <label htmlFor="mois_avance" className="block text-xs text-gray-500 mb-1">Avance (mois)</label>
                <input id="mois_avance" name="mois_avance" type="number" min="0" defaultValue={property.mois_avance ?? ""} className={inputCls} />
              </div>
              <div>
                <label htmlFor="mois_agence" className="block text-xs text-gray-500 mb-1">Frais d&apos;agence (mois)</label>
                <input id="mois_agence" name="mois_agence" type="number" min="0" defaultValue={property.mois_agence ?? ""} className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {typeOffre === "cession" && (
          <div>
            <p className={labelCls}>Conditions de cession <span className="text-gray-400 font-normal">(facultatif)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cout_cession" className="block text-xs text-gray-500 mb-1">Pas de porte / coût de cession (FCFA)</label>
                <input id="cout_cession" name="cout_cession" type="number" min="0" defaultValue={property.cout_cession ?? ""} className={inputCls} />
              </div>
              <div>
                <label htmlFor="loyer_cession" className="block text-xs text-gray-500 mb-1">Loyer mensuel après reprise (FCFA)</label>
                <input id="loyer_cession" name="loyer_cession" type="number" min="0" defaultValue={property.loyer_cession ?? ""} className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="conditions_acquisition" className="block text-xs text-gray-500 mb-1">Conditions d&apos;acquisition</label>
              <textarea id="conditions_acquisition" name="conditions_acquisition" rows={2}
                defaultValue={property.conditions_acquisition ?? ""} maxLength={500} className={`${inputCls} resize-none`} />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="description" className={labelCls}>Description</label>
          <textarea id="description" name="description" rows={4} defaultValue={property.description ?? ""} maxLength={2000}
            className={`${inputCls} resize-none`} />
        </div>

        <button type="submit" disabled={pending}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm">
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</> : <><Save className="w-4 h-4" /> Enregistrer les modifications</>}
        </button>
      </form>

      {/* Zone de danger */}
      <div className="bg-red-50/60 rounded-2xl border border-red-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-red-700">Zone de danger</h2>
        {deleteErr && <p className="text-xs text-red-600">{deleteErr}</p>}
        <p className="text-xs text-red-600">Supprimer cette annonce est définitif.</p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 bg-white border border-red-300 text-red-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> Supprimer cette annonce
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-700 font-medium">Confirmer la suppression ?</span>
            <button onClick={onDelete} disabled={deleting}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Oui, supprimer
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Annuler</button>
          </div>
        )}
      </div>
    </div>
  )
}
