"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserCheck, Loader2 } from "lucide-react"
import { assignLead } from "./actions"

export default function AssignAgent({ leadId, agents, current }: {
  leadId: string
  agents: { id: string; nom: string }[]
  current: string | null
}) {
  const router = useRouter()
  const [sel, setSel] = useState(current ?? "")
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function assign() {
    if (!sel) { setMsg("Choisissez un agent."); return }
    setMsg(null)
    start(async () => {
      const res = await assignLead(leadId, sel)
      if (res.ok) {
        setMsg(res.warning ? `Lead assigné. ⚠ Notification : ${res.warning}` : "Agent assigné et notifié.")
        router.refresh()
      } else {
        setMsg(res.error)
      }
    })
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Assigner à un agent</p>
      {agents.length === 0 ? (
        <p className="text-xs text-gray-400">Aucun agent disponible. Créez des comptes « agent » dans Utilisateurs.</p>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
            <option value="">— Choisir un agent —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <button onClick={assign} disabled={pending}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-xl disabled:opacity-60">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} Assigner & notifier
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
      )}
    </div>
  )
}
