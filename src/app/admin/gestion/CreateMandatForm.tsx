"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Check } from "lucide-react"
import { createMandat } from "./actions"

type Owner = { id: string; nom: string | null; prenom: string | null }
type Prop = { id: string; titre: string }

export default function CreateMandatForm({ owners, properties }: { owners: Owner[]; properties: Prop[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res = await createMandat(fd)
      if (!res.ok) { setErr(res.error); return }
      setOk(true); setOpen(false); router.refresh()
      setTimeout(() => setOk(false), 2500)
    })
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nouveau mandat
        </button>
        {ok && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="w-4 h-4" /> Mandat créé</span>}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Nouveau mandat de gestion</h2>
      {err && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Propriétaire (géré) *</label>
          <select name="proprietaire_id" required className={field}>
            <option value="">— Choisir —</option>
            {owners.map(o => <option key={o.id} value={o.id}>{`${o.prenom ?? ""} ${o.nom ?? ""}`.trim() || o.id.slice(0, 8)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bien</label>
          <select name="property_id" className={field}>
            <option value="">— Aucun / à lier plus tard —</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.titre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select name="type" className={field}>
            <option value="gestion_locative">Gestion locative</option>
            <option value="vente">Vente</option>
            <option value="exclusif">Mandat exclusif</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Commission Inaya (%)</label>
          <input name="commission_pct" type="number" min={0} max={100} step="0.5" placeholder="ex : 10" className={field} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date de début</label>
          <input name="date_debut" type="date" className={field} />
        </div>
      </div>
      <textarea name="notes" rows={2} placeholder="Notes (facultatif)" className={`${field} resize-none`} />

      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Annuler</button>
        <button type="submit" disabled={pending} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer le mandat
        </button>
      </div>
    </form>
  )
}
