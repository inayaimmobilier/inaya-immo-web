"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"
import { supprimerResidence } from "./actions"

export default function DeleteResidenceButton({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function onDelete() {
    setErr(null)
    start(async () => {
      const res = await supprimerResidence(propertyId)
      if (res.ok) router.refresh()
      else setErr(res.error)
    })
  }

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700">
        <Trash2 className="w-3.5 h-3.5" /> Supprimer
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button onClick={onDelete} disabled={pending}
        className="inline-flex items-center gap-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg disabled:opacity-60">
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Confirmer
      </button>
      <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Annuler</button>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </span>
  )
}
