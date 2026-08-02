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

/**
 * DÉCISION : les codes de vérification restent sur WhatsApp et ne passent
 * JAMAIS par cette file. Un OTP tolère mal le moindre aléa — téléphone
 * passerelle éteint, hors réseau, batterie vide — et un code qui n'arrive pas
 * bloque une inscription. WhatsApp, lui, est déjà éprouvé pour cet usage.
 * D'où l'absence volontaire d'un type « otp » ici.
 */
export type TypeSms = "match" | "notification"

/** Une alerte de correspondance passe avant une notification ordinaire. */
const PRIORITE: Record<TypeSms, number> = { match: 10, notification: 0 }

/** Au-delà, la notification n'a plus d'intérêt pour le destinataire. */
const DUREE_VIE_MIN: Record<TypeSms, number> = { match: 240, notification: 240 }

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

    // DERNIER REMPART contre l'envoi répété.
    //
    // Un même message au même numéro n'a aucune valeur la deuxième fois : il
    // coûte, il agace, et il fait passer l'agence pour un robot déréglé. La
    // cause peut être n'importe où en amont — un matching trop large, un
    // double clic, une reprise de traitement. On refuse donc ici, au seul
    // point de passage obligé, plutôt que de compter sur chaque appelant.
    //
    // Fenêtre de 24 h : au-delà, un rappel espacé redevient légitime.
    const depuis = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count } = await admin.from("sms_queue")
      .select("id", { count: "exact", head: true })
      .eq("telephone", numero)
      .eq("message", texte)
      .gte("created_at", depuis)
    if ((count ?? 0) > 0) return true // déjà pris en charge : succès, pas échec

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
