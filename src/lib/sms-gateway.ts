// ============================================================================
// Mise en file des SMS servis par le téléphone passerelle.
//
// Le téléphone n'a pas d'adresse publique : il vient chercher les messages ici
// toutes les quelques secondes. Ce module est le seul point d'entrée pour
// empiler un envoi, et le seul endroit qui décide SMS ou WhatsApp.
//
// Best-effort : une panne de la file ne doit jamais faire échouer l'action
// métier (une inscription, une alerte). L'appelant reçoit false et retombe sur
// WhatsApp.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"
import { estIvoirien, normaliserCI } from "@/lib/phone-ci"

export type TypeSms = "otp" | "match" | "notification"

/** Un OTP passe devant : il expire, une alerte non. */
const PRIORITE: Record<TypeSms, number> = { otp: 100, match: 10, notification: 0 }

/** Au-delà, l'envoi n'a plus d'intérêt — surtout pour un code de vérification. */
const DUREE_VIE_MIN: Record<TypeSms, number> = { otp: 10, match: 240, notification: 240 }

/** La passerelle est-elle activée ? Réglable sans redéploiement. */
export async function passerelleActive(): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "sms_gateway_active").maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    return v === true || v === "true" || v === "1"
  } catch { return false }
}

/**
 * Empile un SMS pour un numéro IVOIRIEN. Renvoie false si le message n'a pas
 * sa place ici — numéro étranger, passerelle éteinte, ou file indisponible —
 * auquel cas l'appelant doit passer par WhatsApp.
 */
export async function enfilerSms(args: {
  telephone: string | null | undefined
  message: string
  type?: TypeSms
}): Promise<boolean> {
  const brut = (args.telephone ?? "").trim()
  const texte = (args.message ?? "").trim()
  if (!brut || !texte) return false

  // Règle métier : le SMS est réservé à la Côte d'Ivoire, le reste va sur WhatsApp.
  if (!estIvoirien(brut)) return false
  const numero = normaliserCI(brut)
  if (!numero) return false

  if (!(await passerelleActive())) return false

  const type: TypeSms = args.type ?? "notification"
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("sms_queue").insert({
      telephone: numero,
      message: texte,
      type,
      priorite: PRIORITE[type],
      expire_le: new Date(Date.now() + DUREE_VIE_MIN[type] * 60_000).toISOString(),
    } as never)
    if (error) { console.error("INAYA-SMSQ-010", error.message); return false }
    return true
  } catch (e) {
    console.error("INAYA-SMSQ-011", e)
    return false
  }
}
