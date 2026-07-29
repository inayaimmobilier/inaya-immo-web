"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Cross, Phone, MapPin, Power } from "lucide-react"
import { addPharmacie, togglePharmacie, removePharmacie, removePharmacies, removeAllPharmacies } from "./actions"

export interface Pharmacie {
  id: string; nom: string; ville: string; quartier: string | null; adresse: string | null
  telephone: string | null; date_debut: string | null; date_fin: string | null; actif: boolean; created_at: string
}

const inp = "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500"

export default function PharmaciesManager({ initialItems }: { initialItems: Pharmacie[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [f, setF] = useState({ nom: "", ville: "Bouaké", quartier: "", telephone: "", adresse: "", date_debut: "", date_fin: "" })
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))

  const toggleSel = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const allSelected = initialItems.length > 0 && sel.length === initialItems.length

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (!f.nom.trim()) { setError("Nom requis."); return }
    start(async () => {
      const r = await addPharmacie(f)
      if (!r.ok) { setError(r.error); return }
      setF({ nom: "", ville: "Bouaké", quartier: "", telephone: "", adresse: "", date_debut: "", date_fin: "" })
      router.refresh()
    })
  }
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (!r.ok && r.error) setError(r.error); router.refresh() })

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={f.nom} onChange={e => set("nom", e.target.value)} placeholder="Nom de la pharmacie *" className={inp} />
          <input value={f.ville} onChange={e => set("ville", e.target.value)} placeholder="Ville" className={inp} />
          <input value={f.quartier} onChange={e => set("quartier", e.target.value)} placeholder="Quartier" className={inp} />
          <input value={f.telephone} onChange={e => set("telephone", e.target.value)} placeholder="Téléphone" className={inp} />
          <input value={f.adresse} onChange={e => set("adresse", e.target.value)} placeholder="Adresse / repère" className={`${inp} sm:col-span-2`} />
          <label className="text-xs text-gray-500 flex flex-col gap-1">Début de garde<input type="date" value={f.date_debut} onChange={e => set("date_debut", e.target.value)} className={inp} /></label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">Fin de garde<input type="date" value={f.date_fin} onChange={e => set("date_fin", e.target.value)} className={inp} /></label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={pending} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl">
          <Plus className="w-4 h-4" /> {pending ? "…" : "Ajouter la pharmacie de garde"}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          {initialItems.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? [] : initialItems.map(p => p.id))} className="w-4 h-4 accent-blue-600" />
              Tout sélectionner
            </label>
          )}
          <span className="text-sm font-semibold text-gray-700">
            {sel.length > 0 ? `${sel.length} sélectionnée${sel.length > 1 ? "s" : ""}` : `${initialItems.length} pharmacie${initialItems.length > 1 ? "s" : ""}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {sel.length > 0 && (
              <button
                onClick={() => { if (confirm(`Supprimer les ${sel.length} pharmacies sélectionnées ?`)) act(async () => { const r = await removePharmacies(sel); setSel([]); return r }) }}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white"
              ><Trash2 className="w-3.5 h-3.5" /> Supprimer la sélection</button>
            )}
            {initialItems.length > 0 && (
              <button
                onClick={() => { if (confirm(`Vider TOUTE la liste (${initialItems.length} pharmacies) ? Cette action est irréversible.`)) act(async () => { const r = await removeAllPharmacies(); setSel([]); return r }) }}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
              ><Trash2 className="w-3.5 h-3.5" /> Tout supprimer</button>
            )}
          </div>
        </div>
        {initialItems.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune pharmacie enregistrée.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {initialItems.map(p => (
              <li key={p.id} className={`px-5 py-3.5 flex items-start gap-3 ${sel.includes(p.id) ? "bg-blue-50/60" : ""}`}>
                <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggleSel(p.id)} className="mt-3 w-4 h-4 accent-blue-600 flex-shrink-0" />
                <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${p.actif ? "bg-teal-50 text-teal-600" : "bg-gray-100 text-gray-400"}`}><Cross className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{p.nom}</span>
                    <span className="text-xs text-gray-500">{p.ville}</span>
                    {!p.actif && <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">inactif</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                    {p.quartier && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.quartier}</span>}
                    {p.telephone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{p.telephone}</span>}
                    {(p.date_debut || p.date_fin) && <span>{p.date_debut ?? "…"} → {p.date_fin ?? "…"}</span>}
                  </div>
                  {p.adresse && <p className="text-xs text-gray-400 mt-0.5">{p.adresse}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => act(() => togglePharmacie(p.id, !p.actif))} disabled={pending} title={p.actif ? "Désactiver" : "Activer"} className={`p-2 rounded-lg ${p.actif ? "text-gray-400 hover:bg-gray-100" : "text-teal-600 hover:bg-teal-50"}`}><Power className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm("Supprimer cette pharmacie ?")) act(() => removePharmacie(p.id)) }} disabled={pending} title="Supprimer" className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
