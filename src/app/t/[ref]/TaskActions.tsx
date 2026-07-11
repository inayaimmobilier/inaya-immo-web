"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Phone, CalendarCheck, Eye, PartyPopper, XCircle, Check, Loader2 } from "lucide-react"
import { setTaskStatus, concludeTask } from "./actions"

const OPTIONS = [
  { statut: "contacte", label: "Je l'ai contacté", Icon: Phone, cls: "hover:border-blue-300" },
  { statut: "visite_planifiee", label: "Visite planifiée", Icon: CalendarCheck, cls: "hover:border-blue-300" },
  { statut: "visite_effectuee", label: "Visite effectuée", Icon: Eye, cls: "hover:border-blue-300" },
  { statut: "conclu", label: "Affaire conclue 🎉", Icon: PartyPopper, cls: "hover:border-green-400 text-green-700" },
  { statut: "abandonne", label: "Client non intéressé", Icon: XCircle, cls: "hover:border-red-300 text-red-600" },
]

const fmt = (n: number) => n.toLocaleString("fr-FR")

export default function TaskActions({ refCode }: { refCode: string }) {
  const [pending, start] = useTransition()
  const [askMontant, setAskMontant] = useState(false)
  const [montant, setMontant] = useState("")
  const [done, setDone] = useState<null | { label: string; commission?: { inaya: number; agent: number } }>(null)
  const [err, setErr] = useState<string | null>(null)

  function choose(statut: string, label: string) {
    if (statut === "conclu") { setAskMontant(true); return }
    setErr(null)
    start(async () => {
      const res = await setTaskStatus(refCode, statut)
      if (!res.ok) { setErr(res.error); return }
      setDone({ label })
    })
  }
  function conclude() {
    const n = Number(montant.replace(/[\s.,]/g, ""))
    if (!n || n <= 0) { setErr("Montant invalide."); return }
    setErr(null)
    start(async () => {
      const res = await concludeTask(refCode, n)
      if (!res.ok) { setErr(res.error); return }
      setDone({ label: "Affaire conclue 🎉", commission: res.ok ? res.commission : undefined })
    })
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto"><Check className="w-7 h-7 text-green-600" /></div>
        <p className="font-semibold text-gray-900">Réponse enregistrée : {done.label}</p>
        {done.commission && (
          <p className="text-sm text-gray-600">Commission Inaya : <b>{fmt(done.commission.inaya)} F</b><br />Votre commission : <b className="text-green-700">{fmt(done.commission.agent)} F</b></p>
        )}
        <p className="text-sm text-gray-500">Merci pour votre travail 🙌</p>
        <Link href="/" className="inline-block text-sm text-blue-700 font-medium">Fermer</Link>
      </div>
    )
  }

  if (askMontant) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-800 text-center">Montant de la transaction (FCFA)</p>
        <input value={montant} onChange={e => setMontant(e.target.value)} inputMode="numeric" autoFocus placeholder="ex : 350000"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center font-semibold outline-none focus:border-green-400" />
        {err && <p className="text-xs text-red-600 text-center">{err}</p>}
        <button onClick={conclude} disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PartyPopper className="w-4 h-4" />} Confirmer l&apos;affaire conclue
        </button>
        <button onClick={() => { setAskMontant(false); setErr(null) }} className="w-full text-xs text-gray-400">Retour</button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800 mb-1">Où en êtes-vous ?</p>
      {OPTIONS.map(({ statut, label, Icon, cls }) => (
        <button key={statut} onClick={() => choose(statut, label)} disabled={pending}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 ${cls}`}>
          <Icon className="w-4.5 h-4.5 shrink-0" /> {label}
        </button>
      ))}
      {err && <p className="text-xs text-red-600 pt-1">{err}</p>}
      {pending && <div className="flex justify-center pt-1"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}
    </div>
  )
}
