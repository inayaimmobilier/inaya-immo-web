"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save, Home } from "lucide-react"
import { savePropertyTypes } from "./actions"
import type { PropertyType } from "@/lib/property-types"

interface Row { code: string; label: string; actif: boolean }

export default function PropertyTypesManager({ initial }: { initial: PropertyType[] }) {
  const [rows, setRows] = useState<Row[]>(
    initial.map(t => ({ code: t.code, label: t.label, actif: t.actif !== false })),
  )
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => setRows(rs => rs.filter((_, j) => j !== i))
  const move = (i: number, d: -1 | 1) =>
    setRows(rs => {
      const j = i + d
      if (j < 0 || j >= rs.length) return rs
      const n = [...rs];[n[i], n[j]] = [n[j], n[i]]; return n
    })
  const add = () => setRows(rs => [...rs, { code: "", label: "", actif: true }])

  function save() {
    setMsg(null)
    start(async () => {
      const res = await savePropertyTypes(rows)
      setMsg(res.ok ? { ok: true, text: "Liste des types de biens enregistrée." } : { ok: false, text: res.error })
    })
  }

  const input = "px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Home className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">Types de biens</h2>
      </div>
      <p className="text-xs text-gray-500">
        La liste proposée dans la recherche (accueil et filtres). Réordonnez, renommez, masquez
        ou ajoutez des types. Les types masqués ne sont plus proposés aux visiteurs.
      </p>

      {msg && (
        <div className={`text-sm rounded-xl px-4 py-2.5 border ${msg.ok ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
            </div>
            <input value={r.label} onChange={e => setRow(i, { label: e.target.value })}
              placeholder="Nom affiché (ex. Entrepôt)" className={`${input} flex-1 min-w-[140px]`} />
            <input value={r.code} onChange={e => setRow(i, { code: e.target.value })}
              placeholder="code (ex. entrepot)" className={`${input} w-40 font-mono text-xs text-gray-500`} />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={r.actif} onChange={e => setRow(i, { actif: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Actif
            </label>
            <button type="button" onClick={() => remove(i)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Supprimer">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700 px-3 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Ajouter un type
        </button>
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
        </button>
      </div>

      <p className="text-[11px] text-gray-400">
        Astuce : le « code » sert au filtrage. Pour qu&apos;un type tout nouveau soit aussi
        <em> publiable</em> (stocké en base), son code doit exister dans l&apos;énumération
        <code className="mx-1 px-1 bg-gray-100 rounded">property_cat</code>. Les types de recherche
        fonctionnent immédiatement.
      </p>
    </div>
  )
}
