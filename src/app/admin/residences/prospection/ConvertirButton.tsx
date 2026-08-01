"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { convertirEnMeublee } from "../actions"

/**
 * Bascule une annonce en résidence meublée. Confirmation demandée : le bien
 * change de type et quitte les résultats de location ordinaire.
 */
export default function ConvertirButton({ propertyId, reference }: {
  propertyId: string; reference: number | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  function convertir() {
    if (!confirm(`Convertir l'annonce N°${reference ?? "—"} en résidence meublée ?`)) return
    setErreur(null)
    start(async () => {
      const r = await convertirEnMeublee(propertyId)
      if (!r.ok) { setErreur(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={convertir} disabled={pending}
        className="inline-flex items-center gap-1.5 text-xs font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-60 px-3 py-2 rounded-lg">
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Convertir
      </button>
      {erreur && <span className="text-[11px] text-red-600">{erreur}</span>}
    </div>
  )
}
