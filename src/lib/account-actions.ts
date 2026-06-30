"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// Domaine interne utilisé quand le client ne fournit pas de vraie adresse e-mail.
// Supabase exige un e-mail pour l'auth par mot de passe : on en synthétise un à
// partir du numéro. Il n'est jamais affiché ni pré-rempli (cf. isRealEmail).
const SYNTH_EMAIL_DOMAIN = "auto.inaya-immo.ci"

type Res = { ok: true } | { ok: false; error: string }

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "")
}
function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "")
}
function synthEmail(phone: string): string {
  return `${phoneDigits(phone)}@${SYNTH_EMAIL_DOMAIN}`
}
/** Vrai e-mail fourni par le client (≠ adresse interne synthétique). */
export async function isRealEmail(email: string | null | undefined): Promise<boolean> {
  return !!email && !email.toLowerCase().endsWith(`@${SYNTH_EMAIL_DOMAIN}`)
}

/**
 * Création de compte « rapide » : nom + téléphone + commune (+ e-mail optionnel)
 * + mot de passe. Le compte est créé confirmé (pas d'e-mail de validation) puis
 * l'utilisateur est connecté immédiatement (cookies de session posés).
 */
export async function quickSignup(input: {
  nom: string; telephone: string; commune: string; password: string; email?: string | null
}): Promise<Res> {
  const nom = input.nom.trim()
  const telephone = normalizePhone(input.telephone)
  const commune = input.commune.trim()
  const realEmail = input.email?.trim().toLowerCase() || null
  const password = input.password

  if (!nom) return { ok: false, error: "Votre nom est requis." }
  if (phoneDigits(telephone).length < 8) return { ok: false, error: "Numéro de téléphone invalide." }
  if (!commune) return { ok: false, error: "Votre commune est requise." }
  if (password.length < 6) return { ok: false, error: "Le mot de passe doit comporter au moins 6 caractères." }

  const email = realEmail ?? synthEmail(telephone)
  const admin = createAdminClient()

  // Anti-doublon sur le téléphone (le téléphone est unique en base).
  const { data: existing } = await admin
    .from("profiles").select("id").eq("telephone", telephone).maybeSingle()
  if (existing) return { ok: false, error: "Un compte existe déjà avec ce numéro. Connectez-vous." }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nom, telephone, commune },
  })
  if (createErr || !created.user) {
    if (createErr?.message?.toLowerCase().includes("already"))
      return { ok: false, error: "Un compte existe déjà avec ces informations. Connectez-vous." }
    console.error("INAYA-AUTH-050", createErr)
    return { ok: false, error: "Échec de la création du compte. Réessayez." }
  }

  // Filet de sécurité : s'assure que la commune est en base (best-effort : la
  // colonne peut ne pas exister si la migration 016 n'est pas encore appliquée).
  const { error: updErr } = await admin.from("profiles")
    .update({ commune } as never).eq("id", created.user.id)
  if (updErr && updErr.code !== "42703") console.error("INAYA-AUTH-051", updErr)

  // Connexion immédiate (pose les cookies de session côté serveur).
  const supabase = await createClient()
  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signErr) {
    console.error("INAYA-AUTH-052", signErr)
    return { ok: false, error: "Compte créé, mais la connexion a échoué. Connectez-vous." }
  }

  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Connexion souple : l'identifiant peut être un e-mail OU un numéro de téléphone.
 * Si c'est un téléphone, on résout l'e-mail (réel ou synthétique) via le profil.
 */
export async function signInFlexible(identifier: string, password: string): Promise<Res> {
  const id = identifier.trim()
  let email = id

  if (!id.includes("@")) {
    const phone = normalizePhone(id)
    const admin = createAdminClient()
    const { data: prof } = await admin
      .from("profiles").select("id").eq("telephone", phone).maybeSingle()
    if (!prof) return { ok: false, error: "Aucun compte trouvé avec ce numéro." }
    const { data: u } = await admin.auth.admin.getUserById((prof as { id: string }).id)
    email = u.user?.email ?? ""
    if (!email) return { ok: false, error: "Compte invalide. Contactez le support." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: "Identifiant ou mot de passe incorrect." }

  revalidatePath("/", "layout")
  return { ok: true }
}
