// ============================================================================
// Normalisation des numéros de téléphone (partagé inscription / connexion /
// admin). Module SANS "use server" : contient des helpers synchrones purs.
// ============================================================================

/** Garde le « + » de tête et les chiffres (« +225 07 07 » → « +2250707 »). */
export function normalizePhone(raw: string): string {
  return (raw || "").replace(/[^\d+]/g, "")
}

/** Chiffres seuls (« +225 07 » → « 22507 »). */
export function phoneDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "")
}

/**
 * Variantes d'un numéro à comparer contre `profiles.telephone`. Nécessaire car
 * l'inscription enregistre le numéro AVEC indicatif (« +2250707840431 ») alors
 * qu'à la connexion l'utilisateur tape souvent son numéro LOCAL (« 0707840431 »).
 * Sans ça : « aucun compte » à la connexion mais « numéro déjà utilisé » à la
 * ré-inscription (impasse). On couvre local ⇄ +225 et les formes avec/sans « + ».
 */
export function phoneMatchCandidates(raw: string): string[] {
  const norm = normalizePhone(raw)
  const digits = phoneDigits(raw)
  const set = new Set<string>()
  if (norm) set.add(norm)
  if (digits) { set.add(digits); set.add(`+${digits}`) }
  // Numéro local (sans indicatif) → variante Côte d'Ivoire (+225).
  if (!norm.startsWith("+") && digits && !digits.startsWith("225")) {
    set.add(`+225${digits}`)
    set.add(`225${digits}`)
  }
  // Numéro déjà en +225…/225… → variante locale (sans indicatif).
  if (digits.startsWith("225") && digits.length > 3) {
    const local = digits.slice(3)
    set.add(local)
    set.add(`+225${local}`)
    set.add(`225${local}`)
  }
  return [...set].filter(Boolean)
}
