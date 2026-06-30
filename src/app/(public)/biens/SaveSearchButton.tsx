"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BellPlus, Loader2, Check } from "lucide-react"
import { saveSearch, type SaveSearchParams } from "./saveSearch"

export default function SaveSearchButton({ params }: { params: SaveSearchParams }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function onClick() {
    setMsg(null)
    startTransition(async () => {
      const res = await saveSearch(params)
      if ("needLogin" in res) {
        const qs = new URLSearchParams(params as Record<string, string>).toString()
        router.push(`/connexion?redirect=${encodeURIComponent(`/biens?${qs}`)}`)
        return
      }
      if (!res.ok) { setMsg(res.error); return }
      setSaved(true)
      setMsg(res.matches > 0 ? `${res.matches} bien(s) déjà disponible(s) — vous serez alerté(e) des prochains.` : "Recherche enregistrée — vous serez alerté(e) dès qu'un bien correspond.")
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={pending || saved}
        className="inline-flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-60"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <BellPlus className="w-4 h-4" />}
        {saved ? "Recherche enregistrée" : "Sauvegarder cette recherche"}
      </button>
      {msg && <span className="text-xs text-gray-500 hidden sm:inline">{msg}</span>}
    </div>
  )
}
