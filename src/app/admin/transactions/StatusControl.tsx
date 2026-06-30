"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { updateTransactionStatus } from "./actions"
import type { TransactionStatus } from "@/types/database"

const FLOW: Record<TransactionStatus, { label: string; cls: string }> = {
  en_cours:        { label: "En cours",        cls: "bg-blue-50 text-blue-700" },
  commission_due:  { label: "Commission due",  cls: "bg-amber-50 text-amber-700" },
  payee:           { label: "Payée",           cls: "bg-green-50 text-green-700" },
  annulee:         { label: "Annulée",         cls: "bg-gray-100 text-gray-500" },
}
const OPTIONS = Object.keys(FLOW) as TransactionStatus[]

export default function StatusControl({ id, statut }: { id: string; statut: TransactionStatus }) {
  const [st, setSt] = useState<TransactionStatus>(statut)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function onChange(next: TransactionStatus) {
    const prev = st; setSt(next); setErr(null)
    startTransition(async () => {
      const res = await updateTransactionStatus(id, next)
      if (!res.ok) { setSt(prev); setErr(res.error) }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
      {err && <span title={err} className="text-xs text-red-500 cursor-help">⚠</span>}
      <select
        value={st}
        disabled={pending}
        onChange={e => onChange(e.target.value as TransactionStatus)}
        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border-0 outline-none cursor-pointer disabled:opacity-50 ${FLOW[st].cls}`}
      >
        {OPTIONS.map(o => <option key={o} value={o}>{FLOW[o].label}</option>)}
      </select>
    </div>
  )
}
