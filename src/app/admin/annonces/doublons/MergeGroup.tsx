"use client"

import { useState, useTransition } from "react"
import { Loader2, GitMerge, Star, Check } from "lucide-react"
import { mergeIntoCanonical } from "./actions"
import { formatPrix, formatRelativeDate } from "@/lib/utils"

export interface DupItem {
  id: string
  titre: string
  prix: number
  statut: string
  quartier: string | null
  created_at: string
  publishers_count: number
}

interface Props {
  items: DupItem[]
}

export default function MergeGroup({ items }: Props) {
  // Par défaut, le canonical = la plus ancienne (premier publieur d'origine)
  const sorted = [...items].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
  const [canonical, setCanonical] = useState<string>(sorted[0].id)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function merge() {
    const sources = items.map(i => i.id).filter(id => id !== canonical)
    if (sources.length === 0) return
    setErr(null)
    startTransition(async () => {
      const res = await mergeIntoCanonical(canonical, sources)
      if (!res.ok) setErr(res.error)
      else setDone(true)
    })
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-2 text-sm text-green-700">
        <Check className="w-4 h-4" /> Annonces fusionnées en une seule. Les publieurs ont été regroupés et réordonnés.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
      <div className="bg-amber-50/60 px-5 py-3 border-b border-amber-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium text-amber-800">
          {items.length} annonces probablement identiques
        </p>
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-red-600">{err}</span>}
          {pending && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          <button
            onClick={merge}
            disabled={pending}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <GitMerge className="w-3.5 h-3.5" /> Fusionner en 1 annonce
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {sorted.map(it => (
          <label key={it.id} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50/60 transition-colors">
            <input
              type="radio"
              name={`canonical-${sorted[0].id}`}
              checked={canonical === it.id}
              onChange={() => setCanonical(it.id)}
              className="w-4 h-4 accent-blue-600"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                {it.titre}
                {canonical === it.id && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 font-medium">
                    <Star className="w-3 h-3 fill-blue-400 text-blue-400" /> à conserver
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {formatPrix(it.prix)} · {it.quartier ?? "—"} · publiée {formatRelativeDate(it.created_at)}
                {it.publishers_count > 1 ? ` · ${it.publishers_count} publieurs` : ""}
              </p>
            </div>
            <span className="text-xs text-gray-400">{it.statut.replace(/_/g, " ")}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
