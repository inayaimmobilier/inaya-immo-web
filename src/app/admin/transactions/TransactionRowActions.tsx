"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, Loader2, Check, X } from "lucide-react"
import { updateTransaction, deleteTransaction } from "./actions"

/** Modifier le montant (→ commission recalculée) et supprimer une transaction. */
export default function TransactionRowActions({ id, montant }: { id: string; montant: number }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(montant))
  const [confirmDel, setConfirmDel] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function save() {
    const n = Number(val.replace(/[\s.,]/g, ""))
    if (!n || n <= 0) { setErr("Montant invalide"); return }
    setErr(null)
    start(async () => {
      const res = await updateTransaction(id, { montant: n })
      if (!res.ok) { setErr(res.error); return }
      setEditing(false); router.refresh()
    })
  }
  function del() {
    setErr(null)
    start(async () => {
      const res = await deleteTransaction(id)
      if (!res.ok) { setErr(res.error); return }
      router.refresh()
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input value={val} onChange={e => setVal(e.target.value)} autoFocus
          className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
        <button onClick={save} disabled={pending} title="Enregistrer" className="p-1.5 rounded-lg bg-green-600 text-white disabled:opacity-60">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { setEditing(false); setVal(String(montant)); setErr(null) }} title="Annuler" className="p-1.5 rounded-lg bg-gray-100 text-gray-500">
          <X className="w-3.5 h-3.5" />
        </button>
        {err && <span title={err} className="text-xs text-red-500 cursor-help">⚠</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => setEditing(true)} title="Modifier le montant"
        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {confirmDel ? (
        <span className="flex items-center gap-1">
          <button onClick={del} disabled={pending} className="text-[11px] font-medium bg-red-600 text-white px-2 py-1 rounded-lg disabled:opacity-60">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirmer"}
          </button>
          <button onClick={() => setConfirmDel(false)} className="text-[11px] text-gray-500 px-1">Annuler</button>
        </span>
      ) : (
        <button onClick={() => setConfirmDel(true)} title="Supprimer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      {err && <span title={err} className="text-xs text-red-500 cursor-help">⚠</span>}
    </div>
  )
}
