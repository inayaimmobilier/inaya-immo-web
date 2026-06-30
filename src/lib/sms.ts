// ============================================================================
// Envoi de SMS via Africa's Talking (AT) — provider dominant en Afrique de l'Ouest.
// Les clés sont lues depuis les variables d'environnement :
//   AT_API_KEY     → clé API Africa's Talking (obligatoire pour envoyer)
//   AT_USERNAME    → nom d'utilisateur AT (défaut : "sandbox" en dev)
//   AT_SENDER_ID   → identifiant affiché comme expéditeur (défaut : "InayaImmo")
//   AT_SANDBOX     → "true" pour pointer vers le sandbox AT (tests sans facturation)
// ============================================================================

const AT_LIVE_URL    = "https://api.africastalking.com/version1/messaging"
const AT_SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging"

/**
 * Normalise un numéro vers le format international Côte d'Ivoire (+225XXXXXXXXXX).
 * Accepte : 0707840431 / 225 07 07 840 431 / +2250707840431 / 07840431 (ancien 8 chiffres).
 * Retourne null si le numéro ne peut pas être normalisé.
 */
export function normalizeCI(tel: string): string | null {
  const digits = tel.replace(/\D/g, "")
  // Déjà en international avec indicatif 225
  if (digits.startsWith("225") && digits.length >= 11) return `+${digits}`
  // 10 chiffres commençant par 0 (format local actuel)
  if (digits.length === 10 && digits.startsWith("0")) return `+225${digits}`
  // 10 chiffres sans 0 initial (ex : 7 07840431)
  if (digits.length === 9) return `+2250${digits}`
  // Ancien format 8 chiffres
  if (digits.length === 8) return `+22507${digits}`
  return null
}

/**
 * Envoie un SMS à un numéro ivoirien.
 * Échoue silencieusement (log only) pour ne pas bloquer le flux client.
 */
export async function sendSms(to: string | null | undefined, message: string): Promise<void> {
  const apiKey = process.env.AT_API_KEY
  if (!apiKey) {
    console.warn("INAYA-SMS-001 AT_API_KEY absent — SMS ignoré")
    return
  }

  const phone = normalizeCI(to ?? "")
  if (!phone) {
    console.warn("INAYA-SMS-002 numéro invalide ou absent", to)
    return
  }

  const username  = process.env.AT_USERNAME  ?? "sandbox"
  const senderId  = process.env.AT_SENDER_ID ?? "InayaImmo"
  const isSandbox = process.env.AT_SANDBOX === "true"
  const url       = isSandbox ? AT_SANDBOX_URL : AT_LIVE_URL

  try {
    const body = new URLSearchParams({ username, to: phone, message, from: senderId })
    const res = await fetch(url, {
      method: "POST",
      headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    })

    const json = await res.json().catch(() => null)
    const recipient = (json as { SMSMessageData?: { Recipients?: { statusCode: number; status: string }[] } } | null)
      ?.SMSMessageData?.Recipients?.[0]

    if (recipient?.statusCode !== 101) {
      console.error("INAYA-SMS-003 AT rejet", phone, recipient?.status ?? JSON.stringify(json))
    } else {
      console.info("INAYA-SMS-004 SMS envoyé", phone)
    }
  } catch (e) {
    console.error("INAYA-SMS-005 erreur réseau", (e as Error).message)
  }
}
