"use client"

import { useEffect, useState } from "react"
import { MessageCircle, Phone, ShieldCheck, X } from "lucide-react"
import { createContactLead } from "./contacter/actions"
import { fbTrack } from "@/lib/analytics"
import { getVisitorContact, recordContactClick, setVisitorContact } from "@/lib/contact-memory"

// Normalise un numéro ivoirien pour wa.me / tel: (international sans « + »).
function intlNumber(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("225")) return d
  if (d.length === 10 && d.startsWith("0")) return `225${d}`
  if (d.length === 8) return `22507${d}`
  return d
}

type Canal = "whatsapp" | "appel"

/**
 * Boutons de contact IMMÉDIAT sur la page annonce : WhatsApp (message pré-rempli
 * avec la référence + le lien) et Appel direct. La mise en relation passe par le
 * numéro Inaya (coordonnées du propriétaire confidentielles).
 *
 * Deux principes, tirés d'un défaut mesuré en production :
 *  1. TOUT clic est enregistré, même anonyme. Auparavant la demande n'était tracée
 *     que pour un visiteur connecté : avec un seul compte client, presque aucun
 *     contact n'apparaissait (644 vues sur 7 jours pour 5 demandes au total).
 *  2. Le prénom et le numéro ne sont demandés QU'UNE FOIS par appareil ; ensuite
 *     le bouton redevient un lien direct, sans friction.
 *
 * L'ouverture finale est toujours un vrai <a> : sur mobile, déclencher la
 * navigation après un traitement asynchrone laisse la page bloquée derrière
 * l'application qui s'ouvre par-dessus.
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
  // Connu = visiteur connecté au profil complet, ou déjà identifié sur cet appareil.
  const initial = contact?.nom && (contact.telephone ?? "").replace(/\D/g, "").length >= 8
    ? { nom: contact.nom, telephone: contact.telephone! }
    : null
  const [connu, setConnu] = useState<{ nom: string; telephone: string } | null>(initial)
  const [canal, setCanal] = useState<Canal | null>(null)  // formulaire ouvert pour ce canal
  const [nom, setNom] = useState("")
  const [tel, setTel] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [pret, setPret] = useState(false)                 // validé → lien d'ouverture affiché

  // localStorage n'existe qu'au navigateur : lecture après montage.
  useEffect(() => { setConnu(c => c ?? getVisitorContact()) }, [])

  if (!phone) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
        Contact direct bientôt disponible. Utilisez le formulaire de visite ci-dessous.
      </p>
    )
  }

  const num = intlNumber(phone)
  const wa = `https://wa.me/${num}?text=${encodeURIComponent(`${message}\n\n${listingUrl}`)}`
  const lien = (c: Canal) => (c === "whatsapp" ? wa : `tel:+${num}`)

  /** Visiteur déjà identifié : on ouvre directement et on enregistre. */
  function ouvrirDirect(c: Canal) {
    fbTrack("Contact", { content_category: c, content_ids: [propertyId] })
    recordContactClick(propertyId, c, true)
    if (connu) {
      createContactLead({ propertyId, nom: connu.nom, telephone: connu.telephone, message })
        .catch(() => { /* best-effort : ne bloque jamais l'ouverture */ })
    }
  }

  /** Visiteur inconnu : l'intention est enregistrée AVANT même de demander quoi que ce soit. */
  function demander(c: Canal) {
    fbTrack("Contact", { content_category: c, content_ids: [propertyId] })
    recordContactClick(propertyId, c, false)
    setCanal(c); setErr(null); setPret(false)
  }

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    const n = nom.trim()
    const t = tel.trim()
    if (n.length < 2) { setErr("Indiquez votre prénom."); return }
    if (t.replace(/\D/g, "").length < 8) { setErr("Indiquez un numéro valide."); return }
    setEnvoi(true); setErr(null)
    setVisitorContact({ nom: n, telephone: t })
    setConnu({ nom: n, telephone: t })
    try {
      await createContactLead({ propertyId, nom: n, telephone: t, message })
      recordContactClick(propertyId, canal ?? "whatsapp", true)
    } catch { /* l'essentiel reste d'ouvrir la conversation */ }
    setEnvoi(false); setPret(true)
  }

  const base = "inline-flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl transition-colors"

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {connu ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => ouvrirDirect("whatsapp")}
            className={`${base} bg-green-600 hover:bg-green-700`}>
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        ) : (
          <button type="button" onClick={() => demander("whatsapp")}
            className={`${base} bg-green-600 hover:bg-green-700`}>
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
        )}

        {connu ? (
          <a href={`tel:+${num}`} onClick={() => ouvrirDirect("appel")}
            className={`${base} bg-blue-700 hover:bg-blue-600`}>
            <Phone className="w-4 h-4" /> Appeler
          </a>
        ) : (
          <button type="button" onClick={() => demander("appel")}
            className={`${base} bg-blue-700 hover:bg-blue-600`}>
            <Phone className="w-4 h-4" /> Appeler
          </button>
        )}
      </div>

      {canal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4"
          role="dialog" aria-modal="true" aria-labelledby="qc-titre">
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="flex items-start gap-2">
              <h3 id="qc-titre" className="font-semibold text-gray-900 flex-1">
                {pret ? "C'est noté !" : "À qui répondons-nous ?"}
              </h3>
              <button type="button" onClick={() => setCanal(null)} aria-label="Fermer"
                className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {pret ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Un agent Inaya suit votre demande. Ouvrez la conversation pour lui écrire.
                </p>
                <a
                  href={lien(canal)}
                  target={canal === "whatsapp" ? "_blank" : undefined}
                  rel={canal === "whatsapp" ? "noopener noreferrer" : undefined}
                  onClick={() => setCanal(null)}
                  className={`${base} w-full ${canal === "whatsapp" ? "bg-green-600 hover:bg-green-700" : "bg-blue-700 hover:bg-blue-600"}`}
                >
                  {canal === "whatsapp"
                    ? <><MessageCircle className="w-4 h-4" /> Ouvrir WhatsApp</>
                    : <><Phone className="w-4 h-4" /> Lancer l&apos;appel</>}
                </a>
              </div>
            ) : (
              <form onSubmit={valider} className="space-y-3">
                <p className="text-sm text-gray-600">
                  Une seule fois : nous saurons vous rappeler si la conversation se perd.
                </p>
                <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Votre prénom" autoFocus
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
                <input value={tel} onChange={e => setTel(e.target.value)} type="tel" placeholder="Votre numéro WhatsApp"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
                {err && <p className="text-xs text-red-600">{err}</p>}
                <button type="submit" disabled={envoi}
                  className={`${base} w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-60`}>
                  {envoi ? "Un instant…" : "Continuer"}
                </button>
                <p className="flex items-start gap-1.5 text-[11px] text-gray-400 leading-relaxed">
                  <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  Votre numéro sert uniquement à cette mise en relation. Il n&apos;est jamais transmis au propriétaire.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
