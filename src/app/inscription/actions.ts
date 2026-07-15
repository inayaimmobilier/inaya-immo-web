"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { issueOtp, verifyOtp, availableCanaux, type OtpCanal } from "@/lib/otp"
import { phoneMatchCandidates } from "@/lib/phone"

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

export type AccountType = "chercheur" | "proprietaire" | "prestataire" | "apporteur" | "agent"
type Res = { ok: true } | { ok: false; error: string }
type RegisterRes = { ok: true; userId: string } | { ok: false; error: string }

// Rôles staff : jamais touchés par l'inscription en libre-service, sous aucun prétexte.
const STAFF_ROLES = ["super_admin", "admin", "moderateur", "agent", "comptable"]

// Type de compte choisi à l'inscription → rôle en base. IMPORTANT : « agent »
// est une CANDIDATURE, jamais un octroi direct du rôle staff — le compte reste
// "client" tant qu'un administrateur n'a pas approuvé la candidature (voir
// recordAgentApplication + approbation dans /admin/agents).
const ROLE_FOR: Record<AccountType, string> = {
  chercheur:    "client",
  proprietaire: "proprietaire",
  prestataire:  "prestataire",
  apporteur:    "apporteur",
  agent:        "client",
}

/** Enregistre (ou met à jour si encore en attente) une candidature agent. Best-effort. */
async function recordAgentApplication(
  admin: ReturnType<typeof createAdminClient>, uid: string, agence: string | null, message: string | null,
): Promise<void> {
  try {
    const { data: existing } = await admin
      .from("agent_applications").select("id").eq("user_id", uid).eq("statut", "en_attente").maybeSingle()
    if (existing) {
      await admin.from("agent_applications").update({ agence, message } as never).eq("id", (existing as { id: string }).id)
    } else {
      await admin.from("agent_applications").insert({ user_id: uid, agence, message, statut: "en_attente" } as never)
    }
  } catch (e) {
    console.error("INAYA-AGENT-APP-001", e)
  }
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
  /** Confirmation du mot de passe (saisie double côté UI). Défense en profondeur
   *  côté serveur au cas où la validation client serait contournée. */
  passwordConfirm?: string
  email?: string | null
  proprietaireType?: "diffuseur" | "gere" | null
  metier?: string | null
  /** Candidature agent (type="agent") : nom d'agence + message facultatifs. */
  agence?: string | null
  message?: string | null
  /**
   * Id renvoyé par un précédent appel RÉUSSI de registerAccount DANS CETTE MÊME
   * page (le client le mémorise après création). Preuve que la correction en
   * cours porte bien sur le compte qu'on vient de créer — jamais déduit d'un
   * simple état de session, pour ne JAMAIS toucher un compte préexistant
   * (ex. un admin resté connecté pendant qu'il teste ce formulaire).
   */
  pendingUserId?: string | null
}): Promise<RegisterRes> {
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
  if (input.passwordConfirm !== undefined && input.passwordConfirm !== password) {
    return { ok: false, error: "Les deux mots de passe ne correspondent pas." }
  }
  if (realEmail && !realEmail.includes("@")) return { ok: false, error: "Adresse e-mail invalide." }
  if (input.type === "prestataire" && !(input.metier ?? "").trim()) return { ok: false, error: "Indiquez votre métier (plomberie, électricité…)." }

  const email = realEmail ?? synthEmail(telephone)
  const admin = createAdminClient()
  const supabase = await createClient()
  const roleVal = ROLE_FOR[input.type]

  // Champs de profil communs (création comme mise à jour), avec repli 42703.
  const fields: Record<string, unknown> = { nom, commune, telephone, role: roleVal }
  if (input.type === "proprietaire") fields.proprietaire_type = input.proprietaireType ?? "diffuseur"
  if (input.type === "prestataire")  fields.metier = (input.metier ?? "").trim()
  const applyFields = async (uid: string) => {
    let { error } = await admin.from("profiles").update(fields as never).eq("id", uid)
    if (error?.code === "42703") {
      const r2 = await admin.from("profiles").update({ nom, commune, telephone, role: roleVal } as never).eq("id", uid)
      error = r2.error
      if (error?.code === "42703") { await admin.from("profiles").update({ nom, telephone } as never).eq("id", uid); error = null }
    }
    if (error) console.error("INAYA-AUTH-061", error)
  }

  // Applique e-mail (si réel) + mot de passe sur un compte auth existant.
  const applyAuth = async (uid: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const patch: Record<string, unknown> = { password }
    if (realEmail) { patch.email = realEmail; patch.email_confirm = true }
    const { error } = await admin.auth.admin.updateUserById(uid, patch as never)
    if (error) {
      if (error.message?.toLowerCase().includes("already")) return { ok: false, error: "Cet e-mail est déjà utilisé par un autre compte." }
      console.error("INAYA-AUTH-063", error)
      return { ok: false, error: "Échec de la mise à jour du compte. Réessayez." }
    }
    return { ok: true }
  }

  // Profil déjà rattaché à ce numéro ? (matching tolérant local ⇄ +225 pour ne
  // pas créer un doublon quand un ancien compte est enregistré sans indicatif.)
  const { data: existRows } = await admin.from("profiles")
    .select("id, verifie, role").in("telephone", phoneMatchCandidates(telephone)).limit(1)
  const existing = ((existRows ?? []) as { id: string; verifie?: boolean; role?: string }[])[0] ?? null

  // ── Cas A : correction d'une inscription en attente, DANS LA MÊME PAGE.
  // On ne réutilise JAMAIS un compte déduit du seul état de session (un compte
  // « non vérifié » n'est PAS un signe fiable d'inscription en cours : tous les
  // comptes créés avant l'OTP — y compris les comptes staff/admin — ont
  // verifie=false par défaut). On exige la PREUVE explicite que le client a bien
  // reçu cet id en retour d'un appel précédent de CETTE fonction, dans cette même
  // page ; et on interdit catégoriquement de toucher un rôle staff, même si prouvé.
  if (input.pendingUserId) {
    const { data: { user: sessionUser } } = await supabase.auth.getUser()
    if (sessionUser && sessionUser.id === input.pendingUserId) {
      const { data: sp } = await admin.from("profiles").select("verifie, role").eq("id", sessionUser.id).maybeSingle()
      const target = sp as { verifie?: boolean; role?: string } | null
      const isStaff = !!target?.role && STAFF_ROLES.includes(target.role)
      if (target && !target.verifie && !isStaff) {
        if (existing && existing.id !== sessionUser.id)
          return { ok: false, error: "Un autre compte utilise déjà ce numéro." }
        await applyFields(sessionUser.id)
        const a = await applyAuth(sessionUser.id)
        if (!a.ok) return a
        if (input.type === "agent") await recordAgentApplication(admin, sessionUser.id, input.agence ?? null, input.message ?? null)
        revalidatePath("/", "layout")
        return { ok: true, userId: sessionUser.id }
      }
    }
    // pendingUserId invalide/périmé/staff → on retombe sur les cas normaux ci-dessous
    // (jamais d'écrasement silencieux d'un compte qu'on ne peut pas prouver sûr).
  }

  // ── Cas B : un compte existe déjà pour ce numéro. On NE reprend JAMAIS
  // automatiquement un compte préexistant (staff ou non) sans preuve explicite
  // ci-dessus. Il faut se connecter.
  if (existing) {
    return { ok: false, error: "Un compte existe déjà avec ce numéro. Connectez-vous." }
  }

  // ── Cas C : création d'un nouveau compte.
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
  await applyFields(created.user.id)
  if (input.type === "agent") await recordAgentApplication(admin, created.user.id, input.agence ?? null, input.message ?? null)

  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signErr) {
    console.error("INAYA-AUTH-062", signErr)
    return { ok: false, error: "Compte créé, mais la connexion a échoué. Connectez-vous." }
  }

  revalidatePath("/", "layout")
  return { ok: true, userId: created.user.id }
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

  // Anti-abus : limite à un code toutes les 45 s. Le cooldown côté client (60 s)
  // protège l'UX, mais ce garde-fou serveur empêche tout contournement (appel
  // direct de la server action) de saturer la file de notifications WhatsApp.
  const since = new Date(Date.now() - 45_000).toISOString()
  const { count } = await admin.from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since)
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Patientez un instant avant de demander un nouveau code." }
  }
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
