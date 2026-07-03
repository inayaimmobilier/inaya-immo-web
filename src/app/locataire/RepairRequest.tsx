"use client"

import { useState, useTransition } from "react"
import { Wrench, Loader2, Check } from "lucide-react"
import { requestRepair } from "./actions"

export default function RepairRequest({ propertyId, proprietaireId }: { propertyId: string | null; proprietaireId: string | null }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [titre, setTitre] = useState("")
  const [description, setDescription] = useState("")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (titre.trim().length < 3) { setErr("Décrivez le problème."); return }
    start(async () => {
      const res = await requestRepair({ propertyId, proprietaireId, titre, description })
      if (!res.ok) { setErr(res.error); return }
      setDone(true); setTitre(""); setDescription("")
    })
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-600" /> Demander une réparation</h2>
      {done ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-3">
          <Check className="w-4 h-4" /> Demande envoyée — Inaya s&apos;en occupe.
          <button onClick={() => setDone(false)} className="ml-auto text-xs text-blue-700 hover:underline">Nouvelle demande</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {err && <p className="text-xs text-red-600">{err}</p>}
          <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Problème (ex : fuite d'eau cuisine)" className={field} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Précisions (facultatif)" className={`${field} resize-none`} />
          <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-60">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />} Envoyer la demande
          </button>
        </form>
      )}
    </div>
  )
}
