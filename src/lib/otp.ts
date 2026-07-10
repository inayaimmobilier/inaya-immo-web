// ============================================================================
// Vérification par code à usage unique (OTP).
//   Canaux : "whatsapp" (dispatcher notifications), "sms" (Africa's Talking),
//            "email" (Resend). Le code est stocké HASHÉ (sha256).
// Toutes les fonctions sont serveur uniquement (service_role).
// ============================================================================
import { createHash, randomInt } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { sendSms } from "@/lib/sms"
import { sendEmail, emailConfigured } from "@/lib/email"

export type OtpCanal = "whatsapp" | "sms" | "email"
type OtpResult = { ok: true } | { ok: false; error: string }

const OTP_TTL_MIN = 10
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}
function genCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/**
 * Canaux réellement livrables selon la config serveur et le contexte du compte.
 * - WhatsApp : toujours (dispatcher en place) si un numéro existe.
 * - SMS      : si AT_API_KEY est présent.
 * - Email    : si un fournisseur e-mail est configuré ET l'utilisateur a un e-mail réel.
 */
export function availableCanaux(opts: { hasPhone: boolean; hasRealEmail: boolean }): OtpCanal[] {
  const list: OtpCanal[] = []
  if (opts.hasPhone) list.push("whatsapp")
  if (opts.hasPhone && process.env.AT_API_KEY) list.push("sms")
  if (opts.hasRealEmail && emailConfigured()) list.push("email")
  return list
}

const CANAL_LABEL: Record<OtpCanal, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "e-mail",
}

/**
 * Génère un code, l'enregistre (haché) et l'envoie via le canal choisi.
 * Invalide les codes précédents non consommés du même utilisateur.
 */
export async function issueOtp(userId: string, canal: OtpCanal, destination: string): Promise<OtpResult> {
  const dest = destination?.trim()
  if (!dest) return { ok: false, error: "Destination manquante pour l'envoi du code." }

  const admin = createAdminClient()
  const code = genCode()
  const expires_at = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString()

  // Invalide les anciens codes actifs (un seul code valide à la fois).
  await admin.from("otp_codes")
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq("user_id", userId).is("consumed_at", null)

  const { error: insErr } = await admin.from("otp_codes").insert({
    user_id: userId, canal, destination: dest, code_hash: hashCode(code), expires_at,
  } as never)
  if (insErr) {
    console.error("INAYA-OTP-001", insErr.message)
    return { ok: false, error: "Impossible de générer le code. Réessayez." }
  }

  const texte = `Inaya Immo : votre code de verification est ${code}. Il expire dans ${OTP_TTL_MIN} minutes. Ne le partagez avec personne.`

  if (canal === "sms") {
    await sendSms(dest, texte)
  } else if (canal === "email") {
    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:auto">
      <h2 style="color:#1d4ed8">Inaya <span style="color:#f59e0b">Immo</span></h2>
      <p>Votre code de vérification est :</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
      <p style="color:#64748b;font-size:13px">Il expire dans ${OTP_TTL_MIN} minutes. Ne le partagez avec personne.</p>
    </div>`
    const sent = await sendEmail(dest, "Votre code de vérification Inaya Immo", html)
    if (!sent) return { ok: false, error: "Envoi de l'e-mail impossible. Choisissez WhatsApp." }
  } else {
    // WhatsApp : envoi DIRECT et synchrone via le service (compte notificateur en
    // priorité), avec repli sur la file d'attente si le service est injoignable.
    const enqueue = async (): Promise<boolean> => {
      const { error } = await admin.from("notifications").insert({
        contact_telephone: dest, canal: "whatsapp", type: "otp_verification",
        titre: "Code de vérification Inaya", contenu: texte, payload: {}, lu: false, envoye: false,
      } as never)
      if (error) console.error("INAYA-OTP-002", error.message)
      return !error
    }

    const waUrl = process.env.WA_SERVICE_URL
    if (waUrl) {
      try {
        // Repli temporaire : WA_OTP_ENGINE=baileys force l'OTP sur le compte Baileys
        // existant tant qu'un template Gupshup (ex. OTP) est encore "Pending" chez
        // Meta — sans toucher aux autres envois (alertes), qui restent sur Gupshup.
        // Retirer cette variable une fois le template approuvé.
        const engine = process.env.WA_OTP_ENGINE === "baileys" ? "baileys" : undefined
        const r = await fetch(`${waUrl}/send-direct`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.WA_HTTP_SECRET ? { "x-inaya-secret": process.env.WA_HTTP_SECRET } : {}),
          },
          body: JSON.stringify({ to: dest, text: texte, engine }),
          signal: AbortSignal.timeout(9000),
        })
        if (r.ok) return { ok: true }
        // Service joignable mais envoi refusé : aucun compte connecté (503) ou
        // numéro absent de WhatsApp (400). On surface la vraie raison à l'utilisateur.
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        await enqueue() // trace pour un retry auto quand le notificateur reviendra
        return { ok: false, error: data.error || "Envoi WhatsApp impossible pour le moment." }
      } catch {
        // Service injoignable → file d'attente, le dispatcher réessaiera.
        if (!(await enqueue())) return { ok: false, error: "Envoi WhatsApp impossible. Réessayez." }
        return { ok: true }
      }
    }
    // Pas d'URL de service configurée → file d'attente classique.
    if (!(await enqueue())) return { ok: false, error: "Envoi WhatsApp impossible. Réessayez." }
  }

  return { ok: true }
}

/**
 * Vérifie le code saisi pour l'utilisateur. Marque le profil comme vérifié en cas
 * de succès. Gère l'expiration et un nombre maximal de tentatives.
 */
export async function verifyOtp(userId: string, code: string): Promise<OtpResult> {
  const admin = createAdminClient()
  const clean = (code ?? "").replace(/\D/g, "")
  if (clean.length !== 6) return { ok: false, error: "Le code doit comporter 6 chiffres." }

  const { data: row } = await admin.from("otp_codes")
    .select("id, code_hash, expires_at, attempts, canal")
    .eq("user_id", userId).is("consumed_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle()

  const otp = row as { id: string; code_hash: string; expires_at: string; attempts: number; canal: string } | null
  if (!otp) return { ok: false, error: "Aucun code actif. Demandez un nouveau code." }

  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await admin.from("otp_codes").update({ consumed_at: new Date().toISOString() } as never).eq("id", otp.id)
    return { ok: false, error: "Code expiré. Demandez un nouveau code." }
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    await admin.from("otp_codes").update({ consumed_at: new Date().toISOString() } as never).eq("id", otp.id)
    return { ok: false, error: "Trop de tentatives. Demandez un nouveau code." }
  }

  if (hashCode(clean) !== otp.code_hash) {
    await admin.from("otp_codes").update({ attempts: otp.attempts + 1 } as never).eq("id", otp.id)
    return { ok: false, error: `Code incorrect. Il reste ${MAX_ATTEMPTS - otp.attempts - 1} tentative(s).` }
  }

  // Succès : consomme le code + marque le profil vérifié.
  await admin.from("otp_codes").update({ consumed_at: new Date().toISOString() } as never).eq("id", otp.id)
  const { error: updErr } = await admin.from("profiles")
    .update({ verifie: true, verified_at: new Date().toISOString(), verified_canal: otp.canal } as never)
    .eq("id", userId)
  // 42703 = colonnes de vérif absentes (migration 034 non appliquée) → succès quand même.
  if (updErr && updErr.code !== "42703") console.error("INAYA-OTP-003", updErr.message)

  return { ok: true }
}

export function canalLabel(c: OtpCanal): string { return CANAL_LABEL[c] }
