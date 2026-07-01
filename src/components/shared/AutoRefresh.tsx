"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

interface Props {
  /** Intervalle de rafraîchissement en millisecondes. Défaut : 30 s. */
  intervalMs?: number
}

/**
 * Rafraîchit silencieusement les Server Components de la route courante à
 * intervalle régulier, sans rechargement de page ni clignotement.
 *
 * `router.refresh()` re-exécute le rendu serveur et réconcilie l'arbre React :
 * l'état client (formulaires en cours de saisie, modales ouvertes, position de
 * scroll) est préservé. L'utilisateur ne perçoit rien — seules les données
 * changées apparaissent.
 *
 * Optimisations :
 *  - se met en pause quand l'onglet est masqué (Page Visibility API) ;
 *  - rafraîchit immédiatement au retour sur l'onglet, pour une fraîcheur perçue ;
 *  - ne rafraîchit pas hors-ligne (évite les erreurs réseau inutiles).
 */
export default function AutoRefresh({ intervalMs = 30_000 }: Props) {
  const router = useRouter()
  // Garde-fou : jamais en-dessous de 5 s pour ne pas marteler le serveur.
  const delay = Math.max(5_000, intervalMs)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const canRefresh = () =>
      document.visibilityState === "visible" &&
      (typeof navigator === "undefined" || navigator.onLine !== false)

    const tick = () => {
      if (canRefresh()) router.refresh()
    }

    const start = () => {
      if (timer.current) return
      timer.current = setInterval(tick, delay)
    }
    const stop = () => {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh() // fraîcheur immédiate au retour sur l'onglet
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router, delay])

  return null
}
