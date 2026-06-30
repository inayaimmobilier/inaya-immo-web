"use client"

import { useState } from "react"
import { CATEGORIE_LABEL } from "@/lib/utils"
import { COMMISSION_MODE_LABEL } from "@/lib/commissions"
import type { CommissionRule } from "@/lib/commissions"
import type { CommissionMode } from "@/types/database"

const CATEGORIES = Object.keys(CATEGORIE_LABEL)
const MODES = Object.keys(COMMISSION_MODE_LABEL) as CommissionMode[]
const SOURCES = ["", "whatsapp", "agent", "proprietaire", "plateforme"]

interface Props {
  /** Server action liée (createRuleAndRedirect ou updateRuleAndRedirect.bind(null,id)). */
  action: (form: FormData) => void | Promise<void>
  initial?: Partial<CommissionRule>
  error?: string
  submitLabel: string
}

const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
const label = "block text-xs font-medium text-gray-600 mb-1.5"

export default function CommissionForm({ action, initial, error, submitLabel }: Props) {
  const [mode, setMode] = useState<CommissionMode>(initial?.mode_calcul ?? "pct_prix")
  const [cats, setCats] = useState<string[]>(initial?.categories ?? [])

  const isPct = mode === "pct_prix" || mode === "pct_loyer" || mode === "combine"
  const valeurLabel =
    mode === "nb_mois" ? "Nombre de mois de loyer" :
    mode === "fixe" ? "Montant fixe (XOF)" :
    "Pourcentage (%)"

  function toggleCat(c: string) {
    setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  return (
    <form action={action} className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Identité */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Identité de la règle</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className={label}>Nom *</label>
            <input name="nom" defaultValue={initial?.nom ?? ""} required placeholder="Ex. Vente standard Bouaké" className={field} />
          </div>
          <div>
            <label className={label}>Priorité</label>
            <input type="number" name="priorite" defaultValue={initial?.priorite ?? 0} className={field} />
            <p className="text-[11px] text-gray-400 mt-1">Plus élevé = prioritaire</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="actif" defaultChecked={initial?.actif ?? true} className="w-4 h-4 rounded accent-blue-600" />
            Règle active
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="est_defaut" defaultChecked={initial?.est_defaut ?? false} className="w-4 h-4 rounded accent-amber-500" />
            Règle par défaut (fallback)
          </label>
        </div>
      </section>

      {/* Critères de correspondance */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Critères de correspondance</h2>
        <p className="text-xs text-gray-400 -mt-2">Laissez un critère vide pour qu&apos;il s&apos;applique à tout.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Type d&apos;opération</label>
            <select name="type_operation" defaultValue={initial?.type_operation ?? "tous"} className={field}>
              <option value="tous">Tous types</option>
              <option value="location">Location</option>
              <option value="vente">Vente</option>
            </select>
          </div>
          <div>
            <label className={label}>Source</label>
            <select name="source" defaultValue={initial?.source ?? ""} className={field}>
              {SOURCES.map(s => <option key={s} value={s}>{s || "Toutes"}</option>)}
            </select>
          </div>
        </div>

        {/* Catégories (multi) */}
        <div>
          <label className={label}>Catégories de biens</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                type="button"
                key={c}
                onClick={() => toggleCat(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  cats.includes(c)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {CATEGORIE_LABEL[c]}
              </button>
            ))}
          </div>
          <input type="hidden" name="categories" value={cats.join(",")} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Quartiers / zones</label>
            <input name="zones" defaultValue={initial?.zones?.join(", ") ?? ""} placeholder="Air France, Koko, …" className={field} />
            <p className="text-[11px] text-gray-400 mt-1">Séparés par des virgules</p>
          </div>
          <div>
            <label className={label}>Tag de contexte</label>
            <input name="contexte_tag" defaultValue={initial?.contexte_tag ?? ""} placeholder="promo_rentree" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Prix / loyer minimum (XOF)</label>
            <input type="number" name="prix_min" defaultValue={initial?.prix_min ?? ""} className={field} />
          </div>
          <div>
            <label className={label}>Prix / loyer maximum (XOF)</label>
            <input type="number" name="prix_max" defaultValue={initial?.prix_max ?? ""} className={field} />
          </div>
        </div>
      </section>

      {/* Mode de calcul */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Mode de calcul</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Méthode</label>
            <select
              name="mode_calcul"
              value={mode}
              onChange={e => setMode(e.target.value as CommissionMode)}
              className={field}
            >
              {MODES.map(m => <option key={m} value={m}>{COMMISSION_MODE_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>{valeurLabel} *</label>
            <input type="number" step="0.0001" name="valeur" defaultValue={initial?.valeur ?? ""} required className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Commission plancher (XOF)</label>
            <input type="number" name="montant_min" defaultValue={initial?.montant_min ?? ""} className={field} />
          </div>
          <div>
            <label className={label}>Commission plafond (XOF)</label>
            <input type="number" name="montant_max" defaultValue={initial?.montant_max ?? ""} className={field} />
          </div>
          <div>
            <label className={label}>Part agent (%)</label>
            <input type="number" step="0.01" name="split_agent_pct" defaultValue={initial?.split_agent_pct ?? 0} className={field} />
            <p className="text-[11px] text-gray-400 mt-1">Le reste revient à Inaya</p>
          </div>
        </div>
        {isPct && (
          <p className="text-[11px] text-gray-400">
            Astuce : pour 5 %, saisissez <strong>5</strong> (et non 0,05).
          </p>
        )}
      </section>

      {/* Validité */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Période de validité (optionnel)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Valide à partir du</label>
            <input type="datetime-local" name="valide_du"
              defaultValue={initial?.valide_du ? initial.valide_du.slice(0, 16) : ""} className={field} />
          </div>
          <div>
            <label className={label}>Valide jusqu&apos;au</label>
            <input type="datetime-local" name="valide_au"
              defaultValue={initial?.valide_au ? initial.valide_au.slice(0, 16) : ""} className={field} />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          {submitLabel}
        </button>
        <a href="/admin/commissions" className="text-sm text-gray-500 hover:text-gray-700">Annuler</a>
      </div>
    </form>
  )
}
