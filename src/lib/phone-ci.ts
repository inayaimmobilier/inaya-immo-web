// ============================================================================
// Numéros ivoiriens : normalisation 8 → 10 chiffres et reconnaissance du pays.
//
// PORT FIDÈLE de la table utilisée par l'application SMS (PhoneNormalizer.kt).
// Les deux côtés DOIVENT convertir de la même façon : si la plateforme met en
// file un numéro que le téléphone normalise différemment, le SMS part au
// mauvais destinataire ou pas du tout.
//
// Migration de 2021 : le préfixe ajouté identifie l'opérateur d'origine.
//   Moov → 01   ·   MTN → 05   ·   Orange → 07   ·   Fixes → 27
// Aucun autre préfixe n'est attribué : produire autre chose donne un numéro
// injoignable (c'est ce que faisait la série 47/48/49, associée à « 03 »).
// ============================================================================

const CI_PREFIXES = new Map<string, string>()
const poser = (liste: string[], prefixe: string) => liste.forEach(p => CI_PREFIXES.set(p, prefixe))
poser(["01", "02", "03", "41", "42", "43", "51", "52", "53", "61", "62", "63", "71", "72", "73"], "01") // Moov
poser(["04", "05", "06", "44", "45", "46", "54", "55", "56", "64", "65", "66", "74", "75", "76"], "05") // MTN
poser(["07", "08", "09", "47", "48", "49", "57", "58", "59", "67", "68", "69", "77", "78", "79"], "07") // Orange
poser(["20", "21", "22", "23", "24", "25", "30", "31", "32", "33", "34", "35", "36"], "27")             // Fixes

const CI_VALIDES = new Set(["01", "05", "07", "27"])

/**
 * Met un numéro au format international +225XXXXXXXXXX.
 * Renvoie null si le numéro n'est pas exploitable — on préfère ne rien envoyer
 * plutôt que d'inventer un destinataire.
 */
export function normaliserCI(brut: string): string | null {
  const chiffres = (brut ?? "").replace(/\D/g, "")
  if (!chiffres) return null

  // Retire l'indicatif s'il est présent (225 ou 00225).
  let local = chiffres
  if (local.startsWith("00225")) local = local.slice(5)
  else if (local.startsWith("225") && local.length > 10) local = local.slice(3)

  if (local.length === 10) {
    return CI_VALIDES.has(local.slice(0, 2)) ? `+225${local}` : null
  }
  if (local.length === 8) {
    const prefixe = CI_PREFIXES.get(local.slice(0, 2))
    if (!prefixe) return null
    return `+225${prefixe}${local}`
  }
  return null
}

/**
 * Le numéro est-il ivoirien ? Un numéro local à 8 ou 10 chiffres, sans
 * indicatif, est considéré comme ivoirien : c'est le cas de la quasi-totalité
 * des contacts de la plateforme.
 */
export function estIvoirien(brut: string): boolean {
  const chiffres = (brut ?? "").replace(/\D/g, "")
  if (!chiffres) return false
  if (chiffres.startsWith("225") || chiffres.startsWith("00225")) return normaliserCI(brut) !== null
  // Un « + » suivi d'un autre indicatif : ce n'est pas la Côte d'Ivoire.
  if ((brut ?? "").trim().startsWith("+")) return false
  return chiffres.length === 8 || chiffres.length === 10
}
