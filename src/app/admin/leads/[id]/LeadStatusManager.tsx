"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Save, Trash2 } from "lucide-react"
import { LEAD_STATUT_LABEL, LEAD_STATUT_COLOR } from "@/lib/utils"
import { setLeadStatut, saveLeadNote, deleteLead } from "./actions"

// Ordre du cycle de vie + l'abandon en option terminale.
const FLOW = ["nouveau", "en_traitement", "contacte", "visite_planifiee", "visite_effectuee", "paiement_planifie", "conclu"]

export default function LeadStatusManager({ leadId, currentStatut, initialNote }: {
  leadId: string; currentStatut: string; initialNote: string | null
}) {
  const router = useRouter()
  const [statut, setStatut] = useState(currentStatut)
  const [note, setNote] = useState(initialNote ?? "")
  const [pending, startTransition] = useTransition()
  const [savingNote, startNote] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function onDelete() {
    setMsg(null)
    startDelete(async () => {
      const res = await deleteLead(leadId)
      if (res.ok) router.push("/admin/leads")
      else setMsg(res.error)
    })
  }

  function changeStatut(next: string) {
    if (next === statut || pending) return
    setMsg(null)
    startTransition(async () => {
      const res = await setLeadStatut(leadId, next)
      if (res.ok) { setStatut(next); router.refresh() }
      else setMsg(res.error)
    })
  }

  function onSaveNote() {
    setMsg(null)
    startNote(async () => {
      const res = await saveLeadNote(leadId, note)
      setMsg(res.ok ? "Note enregistrée." : res.error)
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Étapes du cycle de vie */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Faire évoluer le statut</p>
        <div className="flex flex-wrap gap-2">
          {FLOW.map(s => {
            const active = s === statut
            return (
              <button
                key={s}
                onClick={() => changeStatut(s)}
                disabled={pending}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors disabled:opacity-50 ${
                  active ? LEAD_STATUT_COLOR[s] + " ring-1 ring-current" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {active && <Check className="w-3 h-3" />}
                {LEAD_STATUT_LABEL[s]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Abandon / réactivation */}
      <div className="flex items-center gap-2">
        {statut !== "abandonne" ? (
          <button onClick={() => changeStatut("abandonne")} disabled={pending}
            className="text-xs font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50">
            Abandonner ce lead
          </button>
        ) : (
          <button onClick={() => changeStatut("nouveau")} disabled={pending}
            className="text-xs font-medium text-blue-600 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50">
            Réactiver le lead
          </button>
        )}
        {pending && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {/* Compte-rendu / note interne */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Compte-rendu / note interne</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={4}
          placeholder="Échange avec le client, suite à donner, créneau retenu…"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 resize-y"
        />
        <button onClick={onSaveNote} disabled={savingNote}
          className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
          {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer la note
        </button>
      </div>

      {msg && <p className="text-xs text-gray-500">{msg}</p>}

      {/* Suppression définitive (admin) */}
      <div className="pt-3 border-t border-gray-100">
        {confirmDel ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-red-700">Supprimer définitivement ce lead et ses relances ?</span>
            <button onClick={onDelete} disabled={deleting}
              className="inline-flex items-center gap-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Confirmer
            </button>
            <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDel(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700">
            <Trash2 className="w-3.5 h-3.5" /> Supprimer ce lead
          </button>
        )}
      </div>
    </div>
  )
}
