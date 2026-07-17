"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatRelativeDate, LEAD_STATUT_LABEL } from "@/lib/utils"
import { MessageSquare, ChevronRight, Trash2, X, CheckSquare, Square, Loader2, AlertTriangle } from "lucide-react"
import { deleteLeads, deleteAllLeads } from "./actions"

export interface LeadItem {
  id: string; statut: string; message: string | null; created_at: string; canal: string
  property: { titre: string; quartier: string | null } | null
}

const STATUT_PILL: Record<string, string> = {
  nouveau:       "bg-blue-50 text-blue-700 border-blue-100",
  en_traitement: "bg-indigo-50 text-indigo-700 border-indigo-100",
  contacte:      "bg-cyan-50 text-cyan-700 border-cyan-100",
  visite_planifiee:  "bg-amber-50 text-amber-700 border-amber-100",
  visite_effectuee:  "bg-orange-50 text-orange-700 border-orange-100",
  conclu:        "bg-green-50 text-green-700 border-green-100",
  abandonne:     "bg-gray-100 text-gray-500 border-gray-200",
}

export default function LeadsList({
  leads, statut, totalFiltered,
}: {
  leads: LeadItem[]; statut: string; totalFiltered: number
}) {
  const router = useRouter()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [confirmWord, setConfirmWord] = useState("")

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allOnPageSelected = leads.length > 0 && leads.every(l => selected.has(l.id))
  const toggleAllPage = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) leads.forEach(l => next.delete(l.id))
      else leads.forEach(l => next.add(l.id))
      return next
    })
  }
  const exitSelect = () => { setSelecting(false); setSelected(new Set()) }

  function removeSelection() {
    if (selected.size === 0) return
    if (!confirm(`Supprimer définitivement ${selected.size} lead(s) sélectionné(s) ? Cette action est irréversible.`)) return
    setMsg(null)
    const ids = [...selected]
    startTransition(async () => {
      const res = await deleteLeads(ids)
      if (res.ok) {
        setMsg(`${res.count} lead(s) supprimé(s).`)
        exitSelect()
        router.refresh()
      } else setMsg(res.error)
    })
  }

  function removeAll() {
    if (confirmWord !== "SUPPRIMER") return
    setMsg(null)
    startTransition(async () => {
      const res = await deleteAllLeads({ statut: statut || undefined, confirm: confirmWord })
      if (res.ok) {
        setMsg(`${res.count} lead(s) supprimé(s).`)
        setShowDeleteAll(false); setConfirmWord(""); exitSelect()
        router.refresh()
      } else setMsg(res.error)
    })
  }

  return (
    <div className="space-y-3">
      {/* Barre d'outils suppression */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {!selecting ? (
            <button onClick={() => setSelecting(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-blue-300 transition-colors">
              <CheckSquare className="w-3.5 h-3.5" /> Sélectionner
            </button>
          ) : (
            <>
              <button onClick={toggleAllPage}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-blue-300 transition-colors">
                {allOnPageSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                Tout (page)
              </button>
              <button onClick={removeSelection} disabled={selected.size === 0 || pending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-40">
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer la sélection ({selected.size})
              </button>
              <button onClick={exitSelect}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">
                <X className="w-3.5 h-3.5" /> Annuler
              </button>
            </>
          )}
        </div>
        {totalFiltered > 0 && (
          <button onClick={() => setShowDeleteAll(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
            <AlertTriangle className="w-3.5 h-3.5" /> Tout supprimer{statut ? " (ce filtre)" : ""} ({totalFiltered})
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{msg}</p>}

      {/* Liste */}
      {leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-gray-500 text-sm">Aucun lead pour ce filtre.</p>
        </div>
      ) : leads.map(l => {
        const isSel = selected.has(l.id)
        const inner = (
          <div className="flex items-start gap-4">
            {selecting && (
              <div className="mt-0.5 shrink-0">
                {isSel ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-300" />}
              </div>
            )}
            <div className="mt-0.5 p-2 rounded-xl bg-indigo-50">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">Demande de visite</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUT_PILL[l.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                  {LEAD_STATUT_LABEL[l.statut] ?? l.statut}
                </span>
                {l.canal && <span className="text-xs text-gray-400 capitalize">via {l.canal}</span>}
              </div>
              {l.property && (
                <p className="text-xs text-gray-500 mt-1">
                  Annonce : <span className="text-gray-700 font-medium">{l.property.titre}</span>
                  {l.property.quartier ? ` · ${l.property.quartier}` : ""}
                </p>
              )}
              {l.message && <p className="text-sm text-gray-600 mt-2 leading-relaxed line-clamp-2">{l.message}</p>}
            </div>
            <div className="flex-shrink-0 flex items-center gap-2 text-right">
              <p className="text-xs text-gray-400">{formatRelativeDate(l.created_at)}</p>
              {!selecting && <ChevronRight className="w-4 h-4 text-gray-300" />}
            </div>
          </div>
        )
        const cls = `block bg-white rounded-2xl border p-5 transition-all ${isSel ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-100 hover:shadow-sm hover:border-blue-200"}`
        // En mode sélection, la carte coche/décoche au lieu de naviguer.
        return selecting ? (
          <button key={l.id} type="button" onClick={() => toggle(l.id)} className={`${cls} w-full text-left`}>
            {inner}
          </button>
        ) : (
          <Link key={l.id} href={`/admin/leads/${l.id}`} className={cls}>
            {inner}
          </Link>
        )
      })}

      {/* Modale « Tout supprimer » — double garde-fou (saisie du mot) */}
      {showDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setShowDeleteAll(false); setConfirmWord("") }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Suppression irréversible</h3>
            </div>
            <p className="text-sm text-gray-600">
              Vous êtes sur le point de supprimer définitivement <strong>{totalFiltered} lead{totalFiltered > 1 ? "s" : ""}</strong>
              {statut ? <> du filtre « {LEAD_STATUT_LABEL[statut] ?? statut} »</> : <> (tous statuts confondus)</>}. Cette action ne peut pas être annulée.
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Tapez <strong>SUPPRIMER</strong> pour confirmer :</label>
              <input value={confirmWord} onChange={e => setConfirmWord(e.target.value)} autoFocus
                placeholder="SUPPRIMER"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-red-400" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowDeleteAll(false); setConfirmWord("") }}
                className="text-sm text-gray-600 px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={removeAll} disabled={confirmWord !== "SUPPRIMER" || pending}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 px-4 py-2 rounded-xl hover:bg-red-700 disabled:opacity-40">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
