"use client"

import { useState } from "react"
import { MessageCircle, Phone, Loader2 } from "lucide-react"
import { createContactLead } from "./actions"

// Normalise un numéro ivoirien pour wa.me / tel: (format international sans « + »).
function intlNumber(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("225")) return d
  if (d.length === 10 && d.startsWith("0")) return `225${d}`
  if (d.length === 8) return `22507${d}`
  return d
}

export default function ContactActions({
  propertyId, phone, initialMessage, listingUrl, initialContact,
}: {
  propertyId: string
  phone: string | null
  initialMessage: string
  listingUrl: string
  initialContact?: { nom?: string | null; telephone?: string | null }
}) {
  const [nom, setNom] = useState(initialContact?.nom ?? "")
  const [tel, setTel] = useState(initialContact?.telephone ?? "")
  const [msg, setMsg] = useState(initialMessage)
  const [loading, setLoading] = useState<null | "wa" | "call">(null)
  const [error, setError] = useState<string | null>(null)

  const num = phone ? intlNumber(phone) : ""
  const full = `${msg}\n\n${listingUrl}`
  const wa = phone ? `https://wa.me/${num}?text=${encodeURIComponent(full)}` : null
  const tel2 = phone ? `tel:+${num}` : null

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

  // Ouvre TOUJOURS WhatsApp / l'appel. Si un nom + téléphone valides sont fournis,
  // on crée aussi un lead (best-effort) — mais on ne bloque JAMAIS l'action.
  async function go(kind: "wa" | "call") {
    setError(null)
    const target = kind === "wa" ? wa : tel2
    if (!target) { setError("Numéro de contact non configuré."); return }

    if (nom.trim() && tel.replace(/\D/g, "").length >= 8) {
      setLoading(kind)
      try { await createContactLead({ propertyId, nom, telephone: tel, message: msg }) } catch { /* best-effort */ }
    }
    // Navigation (pas window.open → évite le blocage de pop-up) : ouvre WhatsApp
    // (wa.me) ou l'application téléphone (tel:) selon le bouton.
    window.location.href = target
  }

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Votre nom</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom complet" className={field} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Votre téléphone</label>
          <input value={tel} onChange={e => setTel(e.target.value)} type="tel" placeholder="07 00 00 00 00" className={field} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Votre message</label>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} className={`${field} resize-none`} />
      </div>

      {phone ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => go("wa")} disabled={loading !== null}
            className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
            {loading === "wa" ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />} WhatsApp
          </button>
          <button type="button" onClick={() => go("call")} disabled={loading !== null}
            className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
            {loading === "call" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />} Contacter par appel
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Numéro de contact non configuré. Un administrateur peut l&apos;ajouter dans
          Paramètres → « Contact support ».
        </p>
      )}
      <p className="text-[11px] text-gray-400 text-center">Votre demande est transmise à un agent Inaya qui vous recontacte.</p>
    </div>
  )
}
