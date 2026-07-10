"use client"

import { useState, useTransition } from "react"
import { Bot, Loader2 } from "lucide-react"
import { setWaAssistant } from "./assistant-actions"

export default function AssistantToggle({ initialActif }: { initialActif: boolean }) {
  const [actif, setActif] = useState(initialActif)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function toggle() {
    const next = !actif
    setErr(null)
    start(async () => {
      const res = await setWaAssistant(next)
      if (!res.ok) { setErr(res.error); return }
      setActif(next)
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${actif ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Assistant IA WhatsApp</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-md">
              Répond automatiquement aux messages des clients sur le numéro Inaya : recherche d&apos;annonces
              (par numéro, titre ou critères), prix, localisation et mise en relation.
            </p>
          </div>
        </div>
        <button onClick={toggle} disabled={pending}
          role="switch" aria-checked={actif}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${actif ? "bg-green-600" : "bg-gray-300"}`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${actif ? "translate-x-6" : "translate-x-1"}`}>
            {pending && <Loader2 className="w-5 h-5 animate-spin text-gray-400 p-0.5" />}
          </span>
        </button>
      </div>
      <p className={`text-xs font-medium ${actif ? "text-green-700" : "text-amber-700"}`}>
        {actif ? "● Actif — l'assistant répond aux clients." : "❚❚ En pause — aucun message automatique n'est envoyé."}
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
