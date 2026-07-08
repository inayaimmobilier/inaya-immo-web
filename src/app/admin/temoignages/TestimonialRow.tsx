"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { Star, Check, X, Trash2, Loader2 } from "lucide-react"
import { moderateTestimonial, deleteTestimonial } from "./actions"

export interface AdminTestimonial {
  id: string; nom: string; note: number; message: string; statut: string; created_at: string
}

const STATUT: Record<string, string> = {
  en_attente: "bg-amber-50 text-amber-700 border-amber-100",
  publie: "bg-green-50 text-green-700 border-green-100",
  rejete: "bg-red-50 text-red-700 border-red-100",
}

export default function TestimonialRow({ t }: { t: AdminTestimonial }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (r.ok) router.refresh() })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex">
          {[1, 2, 3, 4, 5].map(n => (
            <Star key={n} className={`w-4 h-4 ${n <= t.note ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          ))}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUT[t.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
          {t.statut.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{t.message}</p>
      <p className="text-sm font-semibold text-gray-900 mt-2">— {t.nom}</p>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {t.statut !== "publie" && (
          <button onClick={() => run(() => moderateTestimonial(t.id, "publie"))} disabled={pending}
            className="inline-flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-60">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Publier
          </button>
        )}
        {t.statut !== "rejete" && (
          <button onClick={() => run(() => moderateTestimonial(t.id, "rejete"))} disabled={pending}
            className="inline-flex items-center gap-1 text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg disabled:opacity-60">
            <X className="w-3.5 h-3.5" /> Rejeter
          </button>
        )}
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} disabled={pending}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg">
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        ) : (
          <span className="inline-flex items-center gap-2">
            <button onClick={() => run(() => deleteTestimonial(t.id))} disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-60">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Confirmer
            </button>
            <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500 hover:text-gray-700">Annuler</button>
          </span>
        )}
      </div>
    </div>
  )
}
