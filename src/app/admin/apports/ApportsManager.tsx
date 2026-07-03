"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, HandCoins } from "lucide-react"
import { createApport, updateApportStatut } from "./actions"
import { formatPrix } from "@/lib/utils"

type Person = { id: string; nom: string | null; prenom: string | null }
type Prop = { id: string; titre: string }
type Row = { id: string; type: string; montant: number | null; statut: string; created_at: string; notes: string | null; profiles: { nom: string | null; prenom: string | null } | null; properties: { titre: string } | null }

const PILL: Record<string, string> = {
  en_attente: "bg-amber-50 text-amber-700", valide: "bg-blue-50 text-blue-700",
  paye: "bg-green-50 text-green-700", rejete: "bg-red-50 text-red-700",
}
const NEXT: Record<string, { statut: string; label: string }[]> = {
  en_attente: [{ statut: "valide", label: "Valider" }, { statut: "rejete", label: "Rejeter" }],
  valide: [{ statut: "paye", label: "Marquer payé" }],
  paye: [], rejete: [],
}

export default function ApportsManager({ apports, apporteurs, properties }: { apports: Row[]; apporteurs: Person[]; properties: Prop[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res = await createApport(fd)
      if (!res.ok) { setErr(res.error); return }
      setOpen(false); router.refresh()
    })
  }
  function changeStatut(id: string, statut: string) {
    start(async () => { const r = await updateApportStatut(id, statut); if (r.ok) router.refresh() })
  }

  return (
    <div className="space-y-4">
      {!open ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nouvel apport
        </button>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Nouvel apport</h2>
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <select name="apporteur_id" required className={field}>
              <option value="">Apporteur *</option>
              {apporteurs.map(a => <option key={a.id} value={a.id}>{`${a.prenom ?? ""} ${a.nom ?? ""}`.trim() || a.id.slice(0, 8)}</option>)}
            </select>
            <select name="type" className={field}>
              <option value="bien">Apport de bien</option>
              <option value="client">Apport de client</option>
            </select>
            <select name="property_id" className={field}>
              <option value="">Bien lié (facultatif)</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.titre}</option>)}
            </select>
            <input name="montant" type="number" placeholder="Commission (FCFA)" className={field} />
            <select name="statut" className={field}>
              <option value="en_attente">En attente</option>
              <option value="valide">Validé</option>
              <option value="paye">Payé</option>
            </select>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes (facultatif)" className={`${field} resize-none`} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={pending} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Enregistrer
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <HandCoins className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Apports ({apports.length})</h2>
        </div>
        {apports.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">Aucun apport enregistré.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {apports.map(a => (
              <li key={a.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{`${a.profiles?.prenom ?? ""} ${a.profiles?.nom ?? ""}`.trim() || "Apporteur"}</p>
                  <p className="text-xs text-gray-500 truncate">{a.properties?.titre ?? a.type} · {a.created_at.slice(0, 10)}{a.notes ? ` · ${a.notes}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.montant != null && <span className="text-sm font-semibold text-gray-900">{formatPrix(a.montant)}</span>}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${PILL[a.statut] ?? "bg-gray-100 text-gray-600"}`}>{a.statut.replace(/_/g, " ")}</span>
                  {(NEXT[a.statut] ?? []).map(n => (
                    <button key={n.statut} onClick={() => changeStatut(a.id, n.statut)} disabled={pending}
                      className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-60">{n.label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
