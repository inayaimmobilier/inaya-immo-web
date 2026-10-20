// ============================================================================
// NUMÉROS DE CONTACT D'INAYA — affichage et liens (utilisable côté client).
//
// Le DG veut que les clients qui ne sont pas à l'aise avec les formulaires
// puissent simplement APPELER (20/10/2026). Les numéros sont gérés dans
// Admin → Paramètres (app_settings.numeros_contact) ; sur téléphone, toucher un
// numéro ouvre directement le composeur.
// ============================================================================

export interface NumeroContact {
  numero: string
  /** « Service client », « Location », « Vente »… */
  libelle: string | null
  /** Ce numéro répond aussi sur WhatsApp. */
  whatsapp: boolean
  actif: boolean
}

const chiffres = (n: string) => n.replace(/\D/g, "")

/** Format international sans « + » : 2250707123456 (numéro ivoirien local complété). */
export function numeroInternational(n: string): string {
  const d = chiffres(n).replace(/^00/, "")
  return d.length === 10 ? `225${d}` : d
}

/** « 07 07 12 34 56 » pour un numéro ivoirien, sinon le numéro tel quel. */
export function numeroAffiche(n: string): string {
  const d = numeroInternational(n)
  const local = d.startsWith("225") && d.length === 13 ? d.slice(3) : null
  return local ? local.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : `+${d}`
}

export const lienAppel = (n: string) => `tel:+${numeroInternational(n)}`

export const lienWhatsApp = (n: string, texte = "Bonjour Inaya Immo, je cherche un bien.") =>
  `https://wa.me/${numeroInternational(n)}?text=${encodeURIComponent(texte)}`
