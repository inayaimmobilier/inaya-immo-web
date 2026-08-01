// ============================================================================
// Mémoire locale du visiteur : prénom + numéro laissés lors d'une prise de
// contact. Objectif — ne demander ces informations QU'UNE SEULE FOIS par
// appareil. Sans cela, réclamer un numéro à chaque annonce ferait fuir plus de
// contacts qu'on n'en enregistrerait.
// Aucune donnée n'est envoyée ailleurs : ce fichier ne fait que lire/écrire
// localStorage côté navigateur.
// ============================================================================

const KEY = "inaya_contact"

export interface VisitorContact { nom: string; telephone: string }

export function getVisitorContact(): VisitorContact | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<VisitorContact>
    const nom = (v.nom ?? "").trim()
    const telephone = (v.telephone ?? "").trim()
    if (!nom || telephone.replace(/\D/g, "").length < 8) return null
    return { nom, telephone }
  } catch { return null }
}

export function setVisitorContact(c: VisitorContact): void {
  if (typeof window === "undefined") return
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* stockage indisponible */ }
}

/** Identifiant visiteur anonyme, partagé avec le suivi de fréquentation. */
export function getVisitorId(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("inaya_vid") } catch { return null }
}

/** Envoi non bloquant, qui survit à la navigation vers WhatsApp. */
export function recordContactClick(propertyId: string, canal: "whatsapp" | "appel", avecContact: boolean): void {
  if (typeof window === "undefined") return
  const body = JSON.stringify({ propertyId, canal, vid: getVisitorId(), avecContact })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/contact-click", new Blob([body], { type: "application/json" }))
    } else {
      void fetch("/api/contact-click", {
        method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true,
      }).catch(() => { /* best-effort */ })
    }
  } catch { /* best-effort */ }
}
