"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ArrowRightLeft, CheckCircle2, Loader2 } from "lucide-react"
import { transferTask } from "./actions"

export default function TransferAgent({
  refCode, agents, closed,
}: {
  refCode: string
  agents: { id: string; nom: string }[]
  closed: boolean
}) {
  const [sel, setSel] = useState("")
  const [pending, start] = useTransition()
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (closed) return <p className="text-sm text-gray-500 text-center">Cette tâche est déjà clôturée.</p>
  if (agents.length === 0) {
    return <p className="text-sm text-gray-500 text-center">Aucun autre agent disponible. Contactez l&apos;administration Inaya.</p>
  }

  if (done) {
    return (
      <div className="text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
        <p className="text-sm font-semibold text-green-800">Tâche transférée à {done} ✓</p>
        <p className="text-xs text-gray-500">Il vient de recevoir la tâche par WhatsApp. Vous n&apos;en êtes plus responsable.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-600">Transférer cette tâche à</label>
      <select value={sel} onChange={e => setSel(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400">
        <option value="">— Choisir un agent —</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
      </select>

      <button onClick={() => { setErr(null); start(async () => {
          const res = await transferTask(refCode, sel)
          if (!res.ok) { setErr(res.error); return }
          setDone(res.agentNom)
        }) }}
        disabled={pending || !sel}
        className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
        {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
        Transférer la tâche
      </button>

      <Link href={`/tc/${refCode}`}
        className="block text-center text-xs text-gray-500 hover:text-blue-700 underline underline-offset-2">
        Finalement, je prends la tâche en charge
      </Link>

      {err && <p className="text-xs text-red-600 text-center">{err}</p>}
    </div>
  )
}
