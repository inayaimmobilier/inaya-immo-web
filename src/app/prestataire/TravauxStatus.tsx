"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { updateTravauxStatus } from "./actions"

const NEXT: Record<string, { statut: string; label: string } | null> = {
  demande: { statut: "en_cours", label: "Démarrer" },
  devis: { statut: "en_cours", label: "Démarrer" },
  en_cours: { statut: "termine", label: "Marquer terminé" },
  termine: null,
  annule: null,
}

const PILL: Record<string, string> = {
  demande: "bg-gray-100 text-gray-600", devis: "bg-blue-50 text-blue-700",
  en_cours: "bg-amber-50 text-amber-700", termine: "bg-green-50 text-green-700", annule: "bg-red-50 text-red-700",
}

export default function TravauxStatus({ id, statut }: { id: string; statut: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const next = NEXT[statut]

  function advance() {
    if (!next) return
    start(async () => {
      const res = await updateTravauxStatus(id, next.statut)
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] px-2 py-0.5 rounded-full ${PILL[statut] ?? "bg-gray-100 text-gray-600"}`}>{statut.replace(/_/g, " ")}</span>
      {next && (
        <button onClick={advance} disabled={pending}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline disabled:opacity-60">
          {pending && <Loader2 className="w-3 h-3 animate-spin" />} {next.label}
        </button>
      )}
    </div>
  )
}
