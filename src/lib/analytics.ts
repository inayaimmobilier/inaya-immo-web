// ============================================================================
// Consentement cookies + événements Pixel Meta (côté client uniquement).
//   - Le Pixel Meta (cookies tiers) ne se charge QU'APRÈS consentement explicite.
//   - Les événements de conversion (Lead, Contact…) sont des no-op tant que le
//     pixel n'est pas chargé (pas de consentement / pas d'ID configuré).
// ============================================================================

export type Consent = "granted" | "denied"

const KEY = "inaya_consent"
export const CONSENT_EVENT = "inaya-consent"

/** Choix enregistré (« granted »/« denied »), ou null si le visiteur n'a pas encore répondu. */
export function getConsent(): Consent | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(KEY)
    return v === "granted" || v === "denied" ? v : null
  } catch { return null }
}

/** Enregistre le choix et prévient les écouteurs (le Pixel se charge si « granted »). */
export function setConsent(v: Consent): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, v)
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: v }))
  } catch { /* stockage indisponible */ }
}

export function hasConsent(): boolean {
  return getConsent() === "granted"
}

/**
 * Émet un événement standard Pixel Meta (Lead, Contact, Search…). No-op si le
 * pixel n'est pas chargé (aucun consentement / aucun ID). Ne lève jamais.
 */
export function fbTrack(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq
  try { if (typeof fbq === "function") fbq("track", event, params) } catch { /* ignore */ }
}
