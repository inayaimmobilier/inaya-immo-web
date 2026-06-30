"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Power, Trash2, Loader2, AlertTriangle } from "lucide-react"
import { setAgentStatus, deleteAgent } from "../actions"

export default function AgentAccount({ agentId, status, nom }: { agentId: string; status: string; nom: string }) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, start] = useTransition()
  const [delPending, delStart] = useTransition()
  const actif = status === "actif"

  function toggle() {
    start(async () => {
      await setAgentStatus(agentId, actif ? "suspendu" : "actif")
      router.refresh()
    })
  }

  function doDelete() {
    delStart(async () => {
      const res = await deleteAgent(agentId)
      if (!res.ok) { alert(res.error); return }
      router.push("/admin/agents")
    })
  }

  return (
    <>
      <button onClick={toggle} disabled={pending}
        className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl transition-colors disabled:opacity-60 ${
          actif ? "border border-red-200 text-red-600 hover:bg-red-50" : "bg-green-600 text-white hover:bg-green-700"
        }`}>
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
        {actif ? "Suspendre" : "Réactiver"}
      </button>

      <button onClick={() => setConfirmDelete(true)} disabled={delPending}
        className="inline-flex items-center gap-1.5 text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl disabled:opacity-60">
        <Trash2 className="w-4 h-4" /> Supprimer
      </button>

      {/* Dialog de confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Supprimer l&apos;agent</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Vous allez supprimer définitivement <strong>{nom}</strong>.
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Les leads et commissions assignés seront désassignés mais conservés. Cette action est irréversible.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={doDelete} disabled={delPending}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {delPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
