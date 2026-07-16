"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * Pixel Meta (Facebook). Le PIXEL ID est configuré dans Admin → Paramètres
 * (app_settings `meta_pixel_id`) et transmis par le layout serveur. Le composant
 * charge fbevents une seule fois puis émet un « PageView » à chaque navigation
 * (Next.js = navigation côté client → pas de rechargement, il faut le déclencher).
 * Si aucun ID n'est configuré, il ne charge RIEN.
 */
declare global {
  interface Window { fbq?: (...args: unknown[]) => void; _fbq?: unknown }
}

export default function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname()
  const loaded = useRef(false)

  // Chargement unique du script + init.
  useEffect(() => {
    if (!pixelId || loaded.current || typeof window === "undefined") return
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
  }, [pixelId])

  // PageView à chaque changement de route (hors premier rendu, déjà émis ci-dessus).
  const first = useRef(true)
  useEffect(() => {
    if (!pixelId || !window.fbq) return
    if (first.current) { first.current = false; return }
    window.fbq("track", "PageView")
  }, [pathname, pixelId])

  return null
}
