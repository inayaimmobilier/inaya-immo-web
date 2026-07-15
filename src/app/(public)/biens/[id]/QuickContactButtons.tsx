"use client"

import { useState } from "react"
import { MessageCircle, Phone, Loader2 } from "lucide-react"
import { createContactLead } from "./contacter/actions"

// Normalise un numéro ivoirien pour wa.me / tel: (international sans « + »).
function intlNumber(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("225")) return d
  if (d.length === 10 && d.startsWith("0")) return `225${d}`
  if (d.length === 8) return `22507${d}`
  return d
}

/**
 * Boutons de contact IMMÉDIAT sur la page annonce : WhatsApp (message pré-rempli
 * avec la référence + le lien) et Appel direct. La mise en relation passe par le
 * numéro Inaya (coordonnées du propriétaire confidentielles). Best-effort : si un
 * visiteur connecté a nom + téléphone, on crée aussi un lead — sans jamais bloquer
 * l'ouverture de WhatsApp / de l'appel.
 */
export default function QuickContactButtons({
  propertyId, phone, message, listingUrl, contact,
}: {
  propertyId: string
  phone: string | null
  message: string
  listingUrl: string
  contact?: { nom?: string | null; telephone?: string | null }
}) {
  const [loading, setLoading] = useState<null | "wa" | "call">(null)

  if (!phone) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
        Contact direct bientôt disponible. Utilisez le formulaire de visite ci-dessous.
      </p>
    )
  }

  const num = intlNumber(phone)
  const wa = `https://wa.me/${num}?text=${encodeURIComponent(`${message}\n\n${listingUrl}`)}`
  const tel = `tel:+${num}`

  async function go(kind: "wa" | "call") {
    const target = kind === "wa" ? wa : tel
    // Trace un lead si on connaît déjà le contact (visiteur connecté) — best-effort.
    if (contact?.nom?.trim() && (contact.telephone ?? "").replace(/\D/g, "").length >= 8) {
      setLoading(kind)
      try { await createContactLead({ propertyId, nom: contact.nom, telephone: contact.telephone!, message }) } catch { /* best-effort */ }
    }
    window.location.href = target
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => go("wa")} disabled={loading !== null}
        className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
        {loading === "wa" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} WhatsApp
      </button>
      <button type="button" onClick={() => go("call")} disabled={loading !== null}
        className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
        {loading === "call" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />} Appeler
      </button>
    </div>
  )
}
