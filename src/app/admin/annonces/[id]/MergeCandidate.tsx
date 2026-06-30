"use client"

import { useState, useTransition } from "react"
import { Loader2, GitMerge, Check } from "lucide-react"
import { mergeIntoCanonical } from "../doublons/actions"
import { formatPrix } from "@/lib/utils"

interface Props {
  canonicalId: string
  candidate: { id: string; titre: string; prix: number; statut: string; score: number }
}

export default function MergeCandidate({ canonicalId, candidate }: Props) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function merge() {
    if (!confirm(`Fusionner « ${candidate.titre} » dans cette annonce ? Elle sera absorbée.`)) return
    setErr(null)
    startTransition(async () => {
      const res = await mergeIntoCanonical(canonicalId, [candidate.id])
      if (!res.ok) setErr(res.error)
      else setDone(true)
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-green-700 bg-green-50 rounded-xl">
        <Check className="w-4 h-4" /> Fusionnée. Le publieur a été ajouté à cette annonce.
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border border-amber-100 rounded-xl hover:bg-amber-50/40 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{candidate.titre}</p>
        <p className="text-xs text-gray-400">
          {formatPrix(candidate.prix)} · {candidate.statut.replace(/_/g, " ")} · similarité {Math.round(candidate.score * 100)}%
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {err && <span title={err} className="text-xs text-red-500 cursor-help">⚠</span>}
        {pending && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
        <button onClick={merge} disabled={pending}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          <GitMerge className="w-3.5 h-3.5" /> Fusionner ici
        </button>
      </div>
    </div>
  )
}
