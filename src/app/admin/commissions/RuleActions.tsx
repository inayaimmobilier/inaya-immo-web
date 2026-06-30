"use client"

import { useState, useTransition } from "react"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { toggleRule, deleteRule } from "./actions"

interface Props {
  id: string
  actif: boolean
  estDefaut: boolean
}

export default function RuleActions({ id, actif, estDefaut }: Props) {
  const [on, setOn] = useState(actif)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function onToggle() {
    const next = !on
    setOn(next); setErr(null)
    startTransition(async () => {
      const res = await toggleRule(id, next)
      if (!res.ok) { setOn(!next); setErr(res.error) }
    })
  }

  function onDelete() {
    if (!confirm("Supprimer définitivement cette règle ?")) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteRule(id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {err && <span title={err} className="text-xs text-red-500 cursor-help">⚠</span>}
      {pending && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}

      {/* Toggle actif */}
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        title={on ? "Désactiver" : "Activer"}
        className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-green-500" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${on ? "translate-x-4" : ""}`} />
      </button>

      <a href={`/admin/commissions/${id}`} title="Modifier"
        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
        <Pencil className="w-4 h-4" />
      </a>

      {!estDefaut && (
        <button type="button" onClick={onDelete} disabled={pending} title="Supprimer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
