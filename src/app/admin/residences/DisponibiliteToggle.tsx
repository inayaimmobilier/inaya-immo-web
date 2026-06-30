"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { setDisponibilite } from "./actions"

export default function DisponibiliteToggle({ propertyId, initial }: {
  propertyId: string; initial: boolean
}) {
  const router = useRouter()
  const [dispo, setDispo] = useState(initial)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !dispo
    setDispo(next)
    start(async () => {
      const res = await setDisponibilite(propertyId, next)
      if (!res.ok) setDispo(!next)
      else router.refresh()
    })
  }

  return (
    <button onClick={toggle} disabled={pending}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-60 ${
        dispo
          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
          : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
      }`}>
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      <span className={`w-2 h-2 rounded-full ${dispo ? "bg-green-500" : "bg-gray-400"}`} />
      {dispo ? "Disponible" : "Indisponible"}
    </button>
  )
}
