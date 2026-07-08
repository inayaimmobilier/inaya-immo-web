"use client"

import { useState } from "react"
import { MessageCircle, Phone } from "lucide-react"

// Normalise un numéro ivoirien pour wa.me / tel: (format international sans « + »).
function intlNumber(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("225")) return d
  if (d.length === 10 && d.startsWith("0")) return `225${d}`
  if (d.length === 8) return `22507${d}`
  return d
}

export default function ContactActions({
  phone, initialMessage, listingUrl,
}: {
  phone: string | null
  initialMessage: string
  listingUrl: string
}) {
  const [msg, setMsg] = useState(initialMessage)
  const num = phone ? intlNumber(phone) : ""
  const full = `${msg}\n\n${listingUrl}`
  const wa = phone ? `https://wa.me/${num}?text=${encodeURIComponent(full)}` : null
  const tel = phone ? `tel:+${num}` : null

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-600">Votre message</label>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={4}
        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none"
      />

      {phone ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <a href={wa!} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors">
            <MessageCircle className="w-5 h-5" /> WhatsApp
          </a>
          <a href={tel!}
            className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-colors">
            <Phone className="w-5 h-5" /> Contacter par appel
          </a>
        </div>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Numéro de contact non configuré. Un administrateur peut l&apos;ajouter dans
          Paramètres → « Contact support ».
        </p>
      )}
    </div>
  )
}
