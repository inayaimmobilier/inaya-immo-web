"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Trash2, Clock, Power } from "lucide-react"
import { createExpiryRule, toggleExpiryRule, deleteExpiryRule } from "./actions"
import type { ExpiryRule } from "@/types/database"

const OFFRE: Record<string, string> = { location: "Location", vente: "Vente", cession: "Cession", residence_meublee: "Résidence meublée" }
const CAT: Record<string, string> = { maison: "Maison", appartement: "Appartement", studio: "Studio", terrain: "Terrain", local_commercial: "Local commercial", bureau: "Bureau", magasin: "Magasin", autre: "Autre" }

function summary(r: ExpiryRule): string {
  const parts: string[] = []
  if (r.type_offre) parts.push(OFFRE[r.type_offre] ?? r.type_offre)
  if (r.categorie) parts.push(CAT[r.categorie] ?? r.categorie)
  if (r.ville) parts.push(`à ${r.ville}`)
  if (r.quartiers?.length) parts.push(`quartier ${r.quartiers.join("/")}`)
  if (r.prix_min != null) parts.push(`prix ≥ ${r.prix_min.toLocaleString("fr-FR")}`)
  if (r.prix_max != null) parts.push(`prix ≤ ${r.prix_max.toLocaleString("fr-FR")}`)
  if (r.meuble != null) parts.push(r.meuble ? "meublé" : "non meublé")
  return parts.length ? parts.join(" · ") : "Toutes les annonces (règle par défaut)"
}

const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

export default function ExpiryRulesManager({ rules }: { rules: ExpiryRule[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res = await createExpiryRule(fd)
      if (!res.ok) { setErr(res.error); return }
      setOpen(false); router.refresh()
    })
  }
  const act = (fn: () => Promise<{ ok: boolean }>) => start(async () => { await fn(); router.refresh() })

  return (
    <div className="space-y-4">
      {!open ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nouvelle règle
        </button>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Nouvelle règle de durée</h2>
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la règle *</label>
              <input name="nom" required placeholder="ex : Petites locations Bouaké" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durée de vie (jours) *</label>
              <input name="duree_jours" type="number" min={1} required placeholder="ex : 7" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type d&apos;opération</label>
              <select name="type_offre" className={field}>
                <option value="">Peu importe</option>
                {Object.entries(OFFRE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type de bien</label>
              <select name="categorie" className={field}>
                <option value="">Peu importe</option>
                {Object.entries(CAT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Commune</label>
              <input name="ville" placeholder="ex : Bouaké" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quartiers (séparés par des virgules)</label>
              <input name="quartiers" placeholder="ex : Belleville, Air France" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix / loyer min</label>
              <input name="prix_min" type="number" placeholder="FCFA" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix / loyer max</label>
              <input name="prix_max" type="number" placeholder="ex : 20000" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Meublé</label>
              <select name="meuble" className={field}>
                <option value="">Peu importe</option>
                <option value="oui">Meublé</option>
                <option value="non">Non meublé</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priorité</label>
              <input name="priorite" type="number" defaultValue={0} className={field} />
              <p className="text-[11px] text-gray-400 mt-1">Plus élevée = évaluée en premier.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={pending} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer la règle
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Règles ({rules.length})</h2>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">Aucune règle. Sans règle, les annonces n&apos;expirent pas.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {rules.map(r => (
              <li key={r.id} className={`px-5 py-4 flex items-center justify-between gap-3 ${r.actif ? "" : "opacity-50"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.nom} <span className="text-xs font-normal text-gray-400">· priorité {r.priorite}</span></p>
                  <p className="text-xs text-gray-500">{summary(r)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Clock className="w-3.5 h-3.5" /> {r.duree_jours} j</span>
                  <button onClick={() => act(() => toggleExpiryRule(r.id, !r.actif))} disabled={pending} title={r.actif ? "Désactiver" : "Activer"}
                    className={`p-1.5 rounded-lg ${r.actif ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}>
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm("Supprimer cette règle ?")) act(() => deleteExpiryRule(r.id)) }} disabled={pending} title="Supprimer"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
