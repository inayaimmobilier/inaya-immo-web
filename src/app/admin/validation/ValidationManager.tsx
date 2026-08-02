"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Check, RefreshCw, X, Wand2 } from "lucide-react"
import { validerDemande, rejeterDemande, recalculerCompletude } from "./actions"
import { LIBELLE_CRITERE } from "@/lib/demande-completude"
import type { PropertyCat, PropertyType } from "@/types/database"

export interface DemandeAValider {
  id: string
  reference: number | null
  contactNom: string | null
  contactTelephone: string | null
  canal: string | null
  texte: string | null
  creeLe: string
  manquants: string[]
  propose: {
    type_offre: PropertyType | null
    categories: PropertyCat[] | null
    commune: string | null
    zones: string[]
    budget_max: number | null
    nb_pieces_min: number | null
  }
}

const CATEGORIES: PropertyCat[] = [
  "maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre",
]

const champ = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
const label = "block text-[11px] font-medium text-gray-500 mb-1"

export default function ValidationManager({
  demandes, totalEnAttente, totalActives, communes,
}: {
  demandes: DemandeAValider[]
  totalEnAttente: number
  totalActives: number
  communes: string[]
}) {
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  const recalculer = () => demarrer(async () => {
    const r = await recalculerCompletude()
    setMessage(r.ok
      ? `${r.n ?? 0} demande(s) débloquée(s) — leurs critères étaient déjà tous connus.`
      : `Échec : ${r.error}`)
  })

  return (
    <div className="space-y-5">
      {/* Le recalcul est mis en avant : après la migration, TOUTES les demandes
          se retrouvent en attente par défaut, y compris celles qui n'ont aucun
          problème. Les traiter à la main serait absurde. */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[16rem]">
          <p className="text-sm font-semibold text-blue-900">
            {totalEnAttente} demande(s) en attente · {totalActives} déjà actives
          </p>
          <p className="text-xs text-blue-800 mt-1 leading-relaxed">
            Le recalcul relit chaque demande en attente et débloque celles dont tous les
            critères sont en fait connus — commune déduite du quartier, budget ou nombre
            de pièces lus dans le texte. Il ne touche jamais à une décision humaine déjà
            prise.
          </p>
        </div>
        <button onClick={recalculer} disabled={enCours}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${enCours ? "animate-spin" : ""}`} />
          Recalculer la complétude
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800">
          {message}
        </div>
      )}

      {demandes.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500">
          Aucune demande en attente de validation.
        </div>
      ) : demandes.map(d => (
        <Carte key={d.id} d={d} communes={communes}
          ouverte={ouverte === d.id}
          onBasculer={() => setOuverte(ouverte === d.id ? null : d.id)}
          onMessage={setMessage} />
      ))}

      {totalEnAttente > demandes.length && (
        <p className="text-center text-xs text-gray-500">
          {demandes.length} affichées sur {totalEnAttente}. Les plus anciennes d&apos;abord —
          traitez-les, les suivantes apparaîtront.
        </p>
      )}
    </div>
  )
}

function Carte({ d, communes, ouverte, onBasculer, onMessage }: {
  d: DemandeAValider
  communes: string[]
  ouverte: boolean
  onBasculer: () => void
  onMessage: (m: string) => void
}) {
  const [typeOffre, setTypeOffre] = useState<string>(d.propose.type_offre ?? "")
  const [cats, setCats] = useState<string[]>(d.propose.categories ?? [])
  const [commune, setCommune] = useState(d.propose.commune ?? "")
  const [zones, setZones] = useState((d.propose.zones ?? []).join(", "))
  const [budget, setBudget] = useState(d.propose.budget_max?.toString() ?? "")
  const [pieces, setPieces] = useState(d.propose.nb_pieces_min?.toString() ?? "")
  const [enCours, demarrer] = useTransition()

  const valider = () => demarrer(async () => {
    const r = await validerDemande(d.id, {
      type_offre: (typeOffre || null) as PropertyType | null,
      categories: cats.length ? (cats as PropertyCat[]) : null,
      commune: commune.trim() || null,
      zones: zones.split(",").map(z => z.trim()).filter(Boolean),
      budget_max: budget.trim() ? Number(budget.replace(/\D/g, "")) : null,
      nb_pieces_min: pieces.trim() ? Number(pieces) : null,
    })
    onMessage(r.ok ? "Demande validée — les alertes reprennent." : `Refusé : ${r.error}`)
  })

  const rejeter = () => demarrer(async () => {
    const r = await rejeterDemande(d.id)
    onMessage(r.ok ? "Demande rejetée." : `Échec : ${r.error}`)
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
      <button onClick={onBasculer} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {d.contactNom || d.contactTelephone || "Sans contact"}
              {d.reference != null && <span className="ml-2 text-xs font-normal text-gray-400">réf. {d.reference}</span>}
            </p>
            {/* Le texte d'origine est la SEULE source de vérité sur le besoin :
                le modérateur doit le lire avant de trancher, pas après. */}
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">
              {d.texte?.trim() || <span className="italic text-gray-400">Aucun texte</span>}
            </p>
          </div>
          <span className="shrink-0 text-xs text-gray-400">
            {new Date(d.creeLe).toLocaleDateString("fr-FR")}
          </span>
        </div>
      </button>

      <div className="flex flex-wrap gap-1.5">
        {d.manquants.map(m => (
          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> {LIBELLE_CRITERE[m] ?? m}
          </span>
        ))}
        {d.manquants.length === 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 border border-emerald-200">
            <Wand2 className="w-3 h-3" /> Tout est déterminé — validez pour débloquer
          </span>
        )}
      </div>

      {ouverte && (
        <div className="pt-3 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Type d&apos;annonce</label>
              <select value={typeOffre} onChange={e => setTypeOffre(e.target.value)} className={champ}>
                <option value="">— à préciser —</option>
                <option value="location">Location</option>
                <option value="vente">Vente</option>
                <option value="residence_meublee">Résidence meublée</option>
              </select>
            </div>
            <div>
              <label className={label}>Commune</label>
              <input list="communes-connues" value={commune} onChange={e => setCommune(e.target.value)}
                placeholder="Bouaké, Yamoussoukro…" className={champ} />
              <datalist id="communes-connues">
                {communes.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className={label}>Type de bien</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => {
                const actif = cats.includes(c)
                return (
                  <button key={c} type="button"
                    onClick={() => setCats(actif ? cats.filter(x => x !== c) : [...cats, c])}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      actif ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                    {c.replace("_", " ")}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className={label}>Quartier(s), séparés par des virgules</label>
              <input value={zones} onChange={e => setZones(e.target.value)}
                placeholder="Air France, Kennedy" className={champ} />
            </div>
            <div>
              <label className={label}>Budget (FCFA)</label>
              <input value={budget} onChange={e => setBudget(e.target.value)}
                inputMode="numeric" placeholder="150000" className={champ} />
            </div>
            <div>
              <label className={label}>Nombre de pièces</label>
              <input value={pieces} onChange={e => setPieces(e.target.value)}
                inputMode="numeric" placeholder="3" className={champ} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={valider} disabled={enCours}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <Check className="w-4 h-4" /> Valider et débloquer les alertes
            </button>
            <button onClick={rejeter} disabled={enCours}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              <X className="w-4 h-4" /> Rejeter
            </button>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            La validation est refusée tant qu&apos;un critère reste vide : vous croiriez
            avoir débloqué le client alors que rien ne partirait.
          </p>
        </div>
      )}
    </div>
  )
}
