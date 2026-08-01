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
 *
 * CORRECTION : cette fonction complétait TOUT numéro à 8 chiffres par « 07 ».
 * Or le préfixe ajouté en 2021 identifie l'opérateur d'origine : un numéro Moov
 * (01xxxxxx) devenait ainsi +2250701xxxxxx, c'est-à-dire un numéro Orange qui
 * ne lui appartient pas — non remis, ou pire, remis à quelqu'un d'autre.
 * La table complète vit dans phone-ci.ts, partagée avec l'application SMS pour
 * que les deux côtés convertissent à l'identique.
 */
import { normaliserCI } from "@/lib/phone-ci"
export { normaliserCI as normalizeCI }

/**
 * Envoie un SMS à un numéro ivoirien.
 * Échoue silencieusement (log only) pour ne pas bloquer le flux client.
 */
export async function sendSms(
  to: string | null | undefined,
  message: string,
  opts: { type?: "match" | "notification" | "otp" } = {},
): Promise<void> {
  // Le telephone passerelle d abord : c est notre propre ligne, sans cout par
  // message. Africa's Talking ne sert plus que de repli quand la passerelle est
  // eteinte ou le numero est hors Cote d Ivoire.
  //
  // SAUF pour un OTP : un code de verification ne doit dependre ni de l etat de
  // charge d un telephone, ni de sa couverture reseau. Il part par le canal
  // eprouve, sans passer par la file.
  const type = opts.type ?? "notification"
  if (type !== "otp") {
    try {
      const { enfilerSms } = await import("@/lib/sms-gateway")
      if (await enfilerSms({ telephone: to, message, type })) return
    } catch (e) { console.error("INAYA-SMS-GW", e) }
  }

  const apiKey = process.env.AT_API_KEY
  if (!apiKey) {
    console.warn("INAYA-SMS-001 AT_API_KEY absent — SMS ignoré")
    return
  }

  const phone = normaliserCI(to ?? "")
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
