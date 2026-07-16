"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Traceur de fréquentation first-party, ANONYME. À chaque navigation, envoie une
 * vue à /api/track avec un identifiant visiteur ALÉATOIRE (localStorage, pas de
 * donnée personnelle). Silencieux : ne bloque ni ne casse jamais la page.
 * Les espaces privés/admin sont ignorés côté serveur.
 */
export default function VisitTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    try {
      let vid = localStorage.getItem("inaya_vid")
      if (!vid) {
        vid = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
        localStorage.setItem("inaya_vid", vid)
      }
      // Référent uniquement s'il est EXTERNE (d'où vient le visiteur).
      let referrer = ""
      try {
        const r = document.referrer
        if (r && new URL(r).host !== location.host) referrer = r
      } catch { /* referrer indisponible */ }

      const body = JSON.stringify({ vid, path: pathname, referrer })
      // sendBeacon = envoi fiable même si l'utilisateur quitte la page aussitôt.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))
      } else {
        void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true })
      }
    } catch { /* best-effort */ }
  }, [pathname])

  return null
}
