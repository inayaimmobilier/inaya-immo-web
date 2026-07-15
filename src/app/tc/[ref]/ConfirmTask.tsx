"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, ShieldCheck, ArrowRightLeft } from "lucide-react"
import { confirmTask } from "./actions"

/**
 * Bouton de confirmation de prise en charge (ouvert depuis le bouton « Confirmer »
 * du message WhatsApp d'assignation). On NE confirme PAS automatiquement au
 * chargement de la page : un GET peut être déclenché par un aperçu de lien ou un
 * préchargement — la confirmation doit rester une action explicite de l'agent.
 */
export default function ConfirmTask({ refCode, closed }: { refCode: string; closed: boolean }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (closed) {
    return <p className="text-sm text-gray-500 text-center">Cette tâche est déjà clôturée.</p>
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
        <p className="text-sm font-semibold text-green-800">Prise en charge confirmée ✓</p>
        <p className="text-xs text-gray-500">Merci ! Le suivi de cette tâche est enregistré.</p>
        <Link href={`/t/${refCode}`}
          className="inline-block text-sm font-medium text-blue-700 hover:text-blue-800 underline underline-offset-2">
          Mettre à jour l&apos;avancement →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button onClick={() => { setErr(null); start(async () => {
          const res = await confirmTask(refCode)
          if (!res.ok) { setErr(res.error); return }
          setDone(true)
        }) }}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
        {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
        Je confirme la prise en charge
      </button>

      <Link href={`/tr/${refCode}`}
        className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-amber-300 text-gray-700 font-medium py-2.5 rounded-xl transition-colors">
        <ArrowRightLeft className="w-4 h-4 text-amber-600" /> Transférer à un autre agent
      </Link>

      {err && <p className="text-xs text-red-600 text-center">{err}</p>}
    </div>
  )
}
