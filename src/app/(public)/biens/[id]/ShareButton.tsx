"use client"

import { useState, useEffect, useRef } from "react"
import { Share2, MessageCircle, Link as LinkIcon, Check, X } from "lucide-react"

/**
 * Bouton « Partager » d'une annonce. Sur mobile (Web Share API disponible),
 * ouvre la feuille de partage native (SMS, WhatsApp, etc.). Sinon, affiche un
 * petit menu avec WhatsApp, SMS et « copier le lien ».
 */
export default function ShareButton({ title, reference }: { title: string; reference?: number | null }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  // URL de la page, lisible seulement côté navigateur (pas au rendu serveur).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setUrl(window.location.href) }, [])

  // Ferme le menu au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const refTxt = reference != null ? `Annonce N°${reference} — ` : ""
  const message = `${refTxt}${title} sur Inaya Immo`
  const shareText = `${message}\n${url}`

  async function handleClick() {
    // Web Share API (mobile) → feuille native (SMS, WhatsApp, e-mail…).
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Inaya Immo", text: message, url })
        return
      } catch {
        // Annulé par l'utilisateur ou indisponible → on ouvre le menu de repli.
      }
    }
    setOpen(o => !o)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard indisponible */ }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const smsHref = `sms:?&body=${encodeURIComponent(shareText)}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleClick}
        title="Partager cette annonce"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700 transition-colors"
      >
        <Share2 className="w-4 h-4" /> Partager
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-gray-500">Partager via</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-green-50 transition-colors">
            <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
          </a>
          <a href={smsHref} onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-blue-50 transition-colors">
            <MessageCircle className="w-4 h-4 text-blue-600" /> SMS
          </a>
          <button onClick={copyLink}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            {copied ? <><Check className="w-4 h-4 text-green-600" /> Lien copié !</> : <><LinkIcon className="w-4 h-4 text-gray-500" /> Copier le lien</>}
          </button>
        </div>
      )}
    </div>
  )
}
