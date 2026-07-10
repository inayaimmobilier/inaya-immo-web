"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Loader2, Briefcase } from "lucide-react"
import { approveAgentApplication, rejectAgentApplication } from "./actions"

export interface PendingApplication {
  id: string
  nom: string
  telephone: string | null
  agence: string | null
  message: string | null
  created_at: string
}

export default function AgentApplications({ applications }: { applications: PendingApplication[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [motif, setMotif] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  function approve(id: string) {
    setBusyId(id); setMsg(null)
    start(async () => {
      const res = await approveAgentApplication(id)
      setBusyId(null)
      if (!res.ok) { setMsg(res.error); return }
      router.refresh()
    })
  }
  function reject(id: string) {
    setBusyId(id); setMsg(null)
    start(async () => {
      const res = await rejectAgentApplication(id, motif)
      setBusyId(null); setRejectingId(null); setMotif("")
      if (!res.ok) { setMsg(res.error); return }
      router.refresh()
    })
  }

  if (applications.length === 0) return null

  return (
    <div className="bg-amber-50/60 rounded-2xl border border-amber-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
        <Briefcase className="w-4 h-4" /> Candidatures agent en attente ({applications.length})
      </h2>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
      <div className="space-y-2">
        {applications.map(a => (
          <div key={a.id} className="bg-white rounded-xl border border-amber-100 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium text-gray-900">{a.nom}</p>
                <p className="text-xs text-gray-500">
                  {a.telephone || "—"}{a.agence ? ` · ${a.agence}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => approve(a.id)} disabled={pending}
                  className="inline-flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
                  {busyId === a.id && pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approuver
                </button>
                <button onClick={() => setRejectingId(rejectingId === a.id ? null : a.id)} disabled={pending}
                  className="inline-flex items-center gap-1 text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-60">
                  <X className="w-3.5 h-3.5" /> Rejeter
                </button>
              </div>
            </div>
            {a.message && <p className="text-xs text-gray-500 mt-2 italic">« {a.message} »</p>}
            {rejectingId === a.id && (
              <div className="mt-2 flex items-center gap-2">
                <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif du rejet (facultatif)"
                  className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-red-300" />
                <button onClick={() => reject(a.id)} disabled={pending}
                  className="text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
                  Confirmer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
