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

/** Types de conversion Google Ads suivis (libellés réglés dans Admin → Paramètres). */
export type AdsConversion = "whatsapp" | "appel" | "formulaire"

/** Coordonnées saisies par le prospect, pour le suivi avancé des conversions. */
export interface ContactProspect { telephone?: string | null; email?: string | null }

/** Numéro au format international E.164 (+225…), ou null si illisible. */
export function telephoneE164(tel: string): string | null {
  const brut = tel.trim()
  let d = brut.replace(/\D/g, "")
  if (brut.startsWith("00")) d = d.slice(2)
  else if (!brut.startsWith("+") && d.length === 10) d = `225${d}` // numéro ivoirien local
  return d.length >= 11 && d.length <= 15 ? `+${d}` : null
}

async function sha256(v: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Conversion Google Ads (clic WhatsApp, appel, demande envoyée). No-op si la
 * balise n'est pas installée ou si aucun libellé n'est réglé pour ce type. Ne lève jamais.
 *
 * Suivi avancé des conversions : si le prospect a donné son téléphone / e-mail
 * ET accepté les cookies, ils sont transmis à Google HACHÉS (SHA-256, jamais en
 * clair) juste avant la conversion. Sans consentement : conversion seule.
 */
export function adsConversion(kind: AdsConversion, contact?: ContactProspect): void {
  if (typeof window === "undefined") return
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; __inayaAds?: { conversions?: Record<string, string> } }
  const sendTo = w.__inayaAds?.conversions?.[kind]
  const gtag = w.gtag
  if (!sendTo || typeof gtag !== "function") return
  const envoyer = () => { try { gtag("event", "conversion", { send_to: sendTo }) } catch { /* ignore */ } }

  const tel = contact?.telephone ? telephoneE164(contact.telephone) : null
  const email = contact?.email?.trim().toLowerCase() || null
  if (!hasConsent() || (!tel && !email) || !crypto?.subtle) { envoyer(); return }
  Promise.all([tel ? sha256(tel) : null, email ? sha256(email) : null])
    .then(([t, e]) => {
      gtag("set", "user_data", { ...(t ? { sha256_phone_number: t } : {}), ...(e ? { sha256_email_address: e } : {}) })
    })
    .catch(() => { /* conversion sans suivi avancé */ })
    .finally(envoyer)
}
