"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { issueOtp, verifyOtp, availableCanaux, type OtpCanal } from "@/lib/otp"

// Adresse interne quand l'utilisateur ne fournit pas de vrai e-mail (email facultatif).
const SYNTH_EMAIL_DOMAIN = "auto.inaya-immo.ci"

function normalizePhone(raw: string): string { return raw.replace(/[^\d+]/g, "") }
function phoneDigits(raw: string): string { return raw.replace(/\D/g, "") }
function synthEmail(phone: string): string { return `${phoneDigits(phone)}@${SYNTH_EMAIL_DOMAIN}` }
function isRealEmail(email: string | null | undefined): boolean {
  return !!email && !email.toLowerCase().endsWith(`@${SYNTH_EMAIL_DOMAIN}`)
}

function maskPhone(p: string | null): string | null {
  if (!p) return null
  const d = p.replace(/\D/g, "")
  return d.length < 4 ? p : `${"•".repeat(Math.max(0, d.length - 2))}${d.slice(-2)}`
}
function maskEmail(e: string | null): string | null {
  if (!e) return null
  const [u, dom] = e.split("@")
  if (!dom) return e
  const mu = u.length <= 2 ? `${u[0]}•` : `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}`
  return `${mu}@${dom}`
}

export type AccountType = "chercheur" | "proprietaire" | "prestataire" | "apporteur"
type Res = { ok: true } | { ok: false; error: string }

// Type de compte choisi à l'inscription → rôle en base (les rôles staff ne sont
// jamais attribuables en self-service).
const ROLE_FOR: Record<AccountType, string> = {
  chercheur:    "client",
  proprietaire: "proprietaire",
  prestataire:  "prestataire",
  apporteur:    "apporteur",
}

/**
 * Crée un compte selon le type choisi (email FACULTATIF), applique le rôle et les
 * champs spécifiques (propriétaire diffuseur/géré, métier prestataire), puis
 * connecte immédiatement l'utilisateur. La vérification OTP se fait ensuite.
 */
export async function registerAccount(input: {
  type: AccountType
  nom: string
  telephone: string
  commune: string
  password: string
  email?: string | null
  proprietaireType?: "diffuseur" | "gere" | null
  metier?: string | null
}): Promise<Res> {
  const nom = input.nom.trim()
  const telephone = normalizePhone(input.telephone)
  const commune = input.commune.trim()
  const realEmail = input.email?.trim().toLowerCase() || null
  const password = input.password

  if (!ROLE_FOR[input.type]) return { ok: false, error: "Type de compte invalide." }
  if (!nom) return { ok: false, error: "Votre nom est requis." }
  if (phoneDigits(telephone).length < 8) return { ok: false, error: "Numéro de téléphone invalide." }
  if (!commune) return { ok: false, error: "Votre commune est requise." }
  if (password.length < 6) return { ok: false, error: "Le mot de passe doit comporter au moins 6 caractères." }
  if (realEmail && !realEmail.includes("@")) return { ok: false, error: "Adresse e-mail invalide." }
  if (input.type === "prestataire" && !(input.metier ?? "").trim()) return { ok: false, error: "Indiquez votre métier (plomberie, électricité…)." }

  const email = realEmail ?? synthEmail(telephone)
  const admin = createAdminClient()

  // Anti-doublon sur le téléphone (unique en base).
  const { data: existing } = await admin.from("profiles").select("id").eq("telephone", telephone).maybeSingle()
  if (existing) return { ok: false, error: "Un compte existe déjà avec ce numéro. Connectez-vous." }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nom, telephone, commune },
  })
  if (createErr || !created.user) {
    if (createErr?.message?.toLowerCase().includes("already"))
      return { ok: false, error: "Un compte existe déjà avec ces informations. Connectez-vous." }
    console.error("INAYA-AUTH-060", createErr)
    return { ok: false, error: "Échec de la création du compte. Réessayez." }
  }
  const uid = created.user.id

  // Rôle + champs spécifiques, avec repli si des colonnes manquent (42703).
  const full: Record<string, unknown> = { commune, role: ROLE_FOR[input.type] }
  if (input.type === "proprietaire") full.proprietaire_type = input.proprietaireType ?? "diffuseur"
  if (input.type === "prestataire")  full.metier = (input.metier ?? "").trim()

  let { error: updErr } = await admin.from("profiles").update(full as never).eq("id", uid)
  if (updErr?.code === "42703") {
    const r2 = await admin.from("profiles").update({ commune, role: ROLE_FOR[input.type] } as never).eq("id", uid)
    updErr = r2.error
    if (updErr?.code === "42703") {
      await admin.from("profiles").update({ commune } as never).eq("id", uid)
      updErr = null
    }
  }
  if (updErr) console.error("INAYA-AUTH-061", updErr)

  // Connexion immédiate (pose les cookies de session).
  const supabase = await createClient()
  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signErr) {
    console.error("INAYA-AUTH-062", signErr)
    return { ok: false, error: "Compte créé, mais la connexion a échoué. Connectez-vous." }
  }

  revalidatePath("/", "layout")
  return { ok: true }
}

/** Canaux de vérification disponibles pour l'utilisateur connecté + destinations masquées. */
export async function verificationOptions(): Promise<{
  canaux: OtpCanal[]; phoneMasked: string | null; emailMasked: string | null; verifie: boolean
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { canaux: [], phoneMasked: null, emailMasked: null, verifie: false }

  const admin = createAdminClient()
  const { data: prof } = await admin.from("profiles").select("telephone, verifie").eq("id", user.id).maybeSingle()
  const p = prof as { telephone?: string | null; verifie?: boolean } | null
  const phone = p?.telephone ?? (user.user_metadata?.telephone as string | undefined) ?? null
  const email = isRealEmail(user.email) ? user.email! : null

  return {
    canaux: availableCanaux({ hasPhone: !!phone, hasRealEmail: !!email }),
    phoneMasked: maskPhone(phone),
    emailMasked: maskEmail(email),
    verifie: !!p?.verifie,
  }
}

/** Envoie un code de vérification via le canal choisi à l'utilisateur connecté. */
export async function sendVerificationCode(canal: OtpCanal): Promise<Res> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." }

  const admin = createAdminClient()
  const { data: prof } = await admin.from("profiles").select("telephone").eq("id", user.id).maybeSingle()
  const phone = (prof as { telephone?: string | null } | null)?.telephone
    ?? (user.user_metadata?.telephone as string | undefined) ?? ""
  const email = isRealEmail(user.email) ? user.email! : ""

  const dest = canal === "email" ? email : phone
  if (!dest) return { ok: false, error: "Aucune destination disponible pour ce canal." }
  return issueOtp(user.id, canal, dest)
}

/** Vérifie le code saisi par l'utilisateur connecté. */
export async function confirmVerificationCode(code: string): Promise<Res> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." }
  const res = await verifyOtp(user.id, code)
  if (res.ok) revalidatePath("/", "layout")
  return res
}
