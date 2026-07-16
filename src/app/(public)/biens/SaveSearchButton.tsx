"use client"

import { useState, useTransition } from "react"
import { BellPlus, Loader2, Check, MessageCircle } from "lucide-react"
import { saveSearch, type SaveSearchParams } from "./saveSearch"
import { fbTrack } from "@/lib/analytics"

export default function SaveSearchButton({ params }: { params: SaveSearchParams }) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [askPhone, setAskPhone] = useState(false)
  const [phone, setPhone] = useState("")
  const [phoneErr, setPhoneErr] = useState<string | null>(null)

  function run(extra?: { telephone?: string }) {
    setMsg(null)
    setPhoneErr(null)
    startTransition(async () => {
      const res = await saveSearch({ ...params, ...extra })
      if ("needPhone" in res) {
        // Anonyme : on demande le numéro WhatsApp au lieu de forcer un compte.
        setAskPhone(true)
        return
      }
      if (!res.ok) { setMsg(res.error); return }
      // Conversion Pixel Meta : abonnement à une alerte de recherche.
      fbTrack("Subscribe")
      setSaved(true)
      setAskPhone(false)
      setMsg(res.matches > 0
        ? `${res.matches} bien(s) déjà disponible(s) — vous serez alerté(e) des prochains.`
        : "Recherche enregistrée — vous serez alerté(e) sur WhatsApp dès qu'un bien correspond.")
    })
  }

  function submitPhone() {
    const cleaned = phone.replace(/[^\d+]/g, "")
    if (cleaned.replace(/\D/g, "").length < 8) {
      setPhoneErr("Entrez un numéro WhatsApp valide.")
      return
    }
    run({ telephone: cleaned })
  }

  if (saved) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-xl text-sm font-medium">
          <Check className="w-4 h-4" /> Recherche enregistrée
        </span>
        {msg && <span className="text-xs text-gray-500 hidden sm:inline">{msg}</span>}
      </div>
    )
  }

  if (askPhone) {
    return (
      <div className="w-full sm:w-auto">
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
          <MessageCircle className="w-4 h-4 text-blue-600 mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-600 mb-2">
              Entrez votre numéro <strong>WhatsApp</strong> : nous vous alertons dès qu&apos;un bien correspond.
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submitPhone() }}
                placeholder="Ex : 07 07 00 00 00"
                className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
              <button
                onClick={submitPhone}
                disabled={pending}
                className="inline-flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 shrink-0"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellPlus className="w-4 h-4" />}
                Activer
              </button>
            </div>
            {phoneErr && <p className="text-xs text-red-600 mt-1">{phoneErr}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => run()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-60"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellPlus className="w-4 h-4" />}
        Sauvegarder cette recherche
      </button>
      {msg && <span className="text-xs text-red-500 hidden sm:inline">{msg}</span>}
    </div>
  )
}
