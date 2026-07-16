"use client"

import { MessageCircle, Phone } from "lucide-react"
import { createContactLead } from "./contacter/actions"
import { fbTrack } from "@/lib/analytics"

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
 * numéro Inaya (coordonnées du propriétaire confidentielles).
 *
 * Ce sont de VRAIS liens <a> : l'ouverture de WhatsApp / du téléphone est native
 * et fiable (pas de window.location.href qui, sur mobile, laisse la page — et donc
 * un spinner — bloquée quand l'app s'ouvre par-dessus). La création du lead est
 * best-effort et NON bloquante : elle ne doit jamais empêcher l'ouverture.
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

  // Trace un lead si on connaît déjà le contact (visiteur connecté). Fire-and-forget :
  // on n'attend pas la réponse pour ne pas retarder l'ouverture de WhatsApp/l'appel.
  function trackLead(channel: "whatsapp" | "call") {
    // Conversion Pixel Meta : prise de contact sur une annonce.
    fbTrack("Contact", { content_category: channel, content_ids: [propertyId] })
    const nom = contact?.nom?.trim()
    const digits = (contact?.telephone ?? "").replace(/\D/g, "")
    if (nom && digits.length >= 8) {
      createContactLead({ propertyId, nom, telephone: contact!.telephone!, message }).catch(() => { /* best-effort */ })
    }
  }

  const base = "inline-flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl transition-colors"

  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => trackLead("whatsapp")}
        className={`${base} bg-green-600 hover:bg-green-700`}>
        <MessageCircle className="w-4 h-4" /> WhatsApp
      </a>
      <a href={tel} onClick={() => trackLead("call")}
        className={`${base} bg-blue-700 hover:bg-blue-600`}>
        <Phone className="w-4 h-4" /> Appeler
      </a>
    </div>
  )
}
