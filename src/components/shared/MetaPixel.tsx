"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { getConsent, CONSENT_EVENT, type Consent } from "@/lib/analytics"

/**
 * Pixel Meta (Facebook). Le PIXEL ID vient d'Admin → Paramètres (transmis par le
 * layout serveur). Le pixel N'EST CHARGÉ QU'APRÈS consentement (bandeau cookies) :
 * conforme RGPD. Émet « PageView » au chargement puis à chaque navigation.
 * Aucun ID configuré OU consentement refusé → ne charge rien.
 */
declare global {
  interface Window { fbq?: (...args: unknown[]) => void; _fbq?: unknown }
}

export default function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname()
  const [granted, setGranted] = useState(false)
  const loaded = useRef(false)
  const firstPageView = useRef(true)

  // Suit le consentement : au montage + à chaque changement via le bandeau.
  useEffect(() => {
    setGranted(getConsent() === "granted")
    const onChange = (e: Event) => setGranted((e as CustomEvent<Consent>).detail === "granted")
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [])

  // Chargement unique de fbevents, seulement si ID présent ET consentement donné.
  useEffect(() => {
    if (!pixelId || !granted || loaded.current || typeof window === "undefined") return
    loaded.current = true
    /* eslint-disable */
    ;(function (f: any, b, e, v, n?: any, t?: any, s?: any) {
      if (f.fbq) return
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
      if (!f._fbq) f._fbq = n
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = []
      t = b.createElement(e); t.async = true; t.src = v
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js")
    /* eslint-enable */
    window.fbq?.("init", pixelId)
    window.fbq?.("track", "PageView")
    firstPageView.current = false
  }, [pixelId, granted])

  // PageView à chaque navigation (hors 1er, déjà émis au chargement).
  useEffect(() => {
    if (!granted || !loaded.current || !window.fbq) return
    if (firstPageView.current) { firstPageView.current = false; return }
    window.fbq("track", "PageView")
  }, [pathname, granted])

  return null
}
