"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { BellOff, Check, Loader2 } from "lucide-react"
import { stopAlert } from "./actions"

export default function StopConfirm({ refNum }: { refNum: number }) {
  const [done, setDone] = useState<null | "ok" | "already">(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function confirm() {
    setErr(null)
    start(async () => {
      const res = await stopAlert(refNum)
      if (!res.ok) { setErr(res.error); return }
      setDone(res.already ? "already" : "ok")
    })
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <p className="font-semibold text-gray-900">
          {done === "already" ? `L'alerte R${refNum} était déjà désactivée.` : `Alerte R${refNum} désactivée.`}
        </p>
        <p className="text-sm text-gray-500">Vous ne recevrez plus de biens pour cette recherche.</p>
        <Link href="/biens" className="inline-block mt-2 text-sm font-medium text-blue-700 hover:text-blue-800">
          Parcourir les annonces →
        </Link>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
        <BellOff className="w-7 h-7 text-amber-600" />
      </div>
      <div>
        <p className="font-semibold text-gray-900">Arrêter l&apos;alerte R{refNum} ?</p>
        <p className="text-sm text-gray-500 mt-1">Vous ne recevrez plus de notifications pour cette recherche sauvegardée.</p>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button onClick={confirm} disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />} Confirmer l&apos;arrêt
      </button>
      <Link href="/biens" className="block text-xs text-gray-400 hover:text-gray-600">Garder mon alerte active</Link>
    </div>
  )
}
