"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Flag, Loader2, Check, AlertTriangle } from "lucide-react"
import { marquerSignalementsTraites } from "./actions"
import { formatDate } from "@/lib/utils"

interface Report {
  id: string
  categorie: string | null
  motif: string | null
  contact: string | null
  created_at: string
}

export default function SignalementsPanel({ propertyId, reports }: {
  propertyId: string
  reports: Report[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function traiter() {
    setError(null)
    start(async () => {
      const res = await marquerSignalementsTraites(propertyId)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <section className="bg-red-50 border-2 border-red-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-red-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h2 className="text-sm font-bold text-red-800">
            {reports.length} signalement{reports.length > 1 ? "s" : ""} à traiter
          </h2>
        </div>
        <button
          onClick={traiter}
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Marquer traité
        </button>
      </div>

      <ul className="divide-y divide-red-100">
        {reports.map(r => (
          <li key={r.id} className="px-5 py-3">
            <div className="flex items-start gap-2">
              <Flag className="w-3.5 h-3.5 text-red-500 mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {r.categorie && (
                    <span className="text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      {r.categorie}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-500">{formatDate(r.created_at)}</span>
                </div>
                {r.motif
                  ? <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{r.motif}</p>
                  : <p className="text-sm text-gray-400 italic mt-1">Aucun motif précisé</p>}
                {r.contact && (
                  <p className="text-xs text-gray-500 mt-1">Contact signaleur : {r.contact}</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-700 bg-red-100 px-5 py-2">{error}</p>}

      <p className="text-[11px] text-red-600/80 px-5 py-3 border-t border-red-100">
        Vérifiez l&apos;annonce ci-dessous : modifiez, suspendez ou supprimez-la, puis marquez comme traité.
      </p>
    </section>
  )
}
