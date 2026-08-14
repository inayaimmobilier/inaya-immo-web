"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pause, Play, Plus } from "lucide-react"
import { pauserConversation, reprendreConversation } from "./actions"

/** Bouton Pause / Reprendre d'une conversation déjà listée. */
export function BasculePause({ telephone, enPause }: { telephone: string; enPause: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function basculer() {
    setErr(null)
    start(async () => {
      const res = enPause
        ? await reprendreConversation(telephone)
        : await pauserConversation(telephone, "")
      if (!res.ok) { setErr(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={basculer} disabled={pending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-60 ${
          enPause
            ? "bg-green-600 hover:bg-green-500 text-white"
            : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}>
        {pending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : enPause ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        {enPause ? "Rendre la main à l'assistante" : "Répondre moi-même"}
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

/**
 * Mise en pause d'un numéro qui n'apparaît pas encore dans la liste — une
 * conversation plus ancienne que le journal, ou un client qui vient tout juste
 * d'écrire. Sans ce champ, l'admin devrait attendre que le numéro remonte.
 */
export function PauseManuelle() {
  const router = useRouter()
  const [numero, setNumero] = useState("")
  const [motif, setMotif] = useState("")
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function ajouter() {
    setErr(null)
    start(async () => {
      const res = await pauserConversation(numero, motif)
      if (!res.ok) { setErr(res.error); return }
      setNumero(""); setMotif(""); router.refresh()
    })
  }

  const champ = "px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Mettre un numéro en pause</h2>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
        <input value={numero} onChange={e => setNumero(e.target.value)}
          placeholder="07 09 13 43 19" className={champ} />
        <input value={motif} onChange={e => setMotif(e.target.value)}
          placeholder="Motif (facultatif) — négociation en cours…" className={champ} />
        <button onClick={ajouter} disabled={pending || numero.trim().length === 0}
          className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Mettre en pause
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Peu importe l&apos;écriture du numéro : 07…, +22507… ou 22507… désignent le même abonné.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
