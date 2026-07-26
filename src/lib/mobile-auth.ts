// ============================================================================
// Auth mobile par MOT DE PASSE — helpers partagés (login / register / reset).
//   Les comptes sont des utilisateurs Supabase Auth (comme le web). Le login se
//   fait par téléphone (indicatif + numéro) OU e-mail + mot de passe. L'OTP n'est
//   utilisé que pour réinitialiser un mot de passe oublié.
//   Serveur uniquement.
// ============================================================================
import { createServerClient } from "@supabase/ssr"
import { createAdminClient } from "@/lib/supabase/server"
import { normalizePhone, phoneDigits, phoneMatchCandidates } from "@/lib/phone"

const SYNTH_EMAIL_DOMAIN = "auto.inaya-immo.ci"
export const synthEmail = (phone: string) => `${phoneDigits(phone)}@${SYNTH_EMAIL_DOMAIN}`
export const isRealEmail = (email: string | null | undefined) =>
  !!email && !email.toLowerCase().endsWith(`@${SYNTH_EMAIL_DOMAIN}`)
export const looksLikeEmail = (v: string) => /\S+@\S+\.\S+/.test(v.trim())

/** Client Supabase SANS persistance de cookies — pour vérifier un mot de passe. */
function statelessAuthClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export interface ResolvedAccount {
  userId: string
  email: string | null
  telephone: string | null
  nom: string | null
  role: string | null
  status: string | null
}

/** Retrouve un compte par e-mail OU téléphone (identifiant de connexion). */
export async function resolveAccount(identifier: string): Promise<ResolvedAccount | null> {
  const admin = createAdminClient()
  const id = identifier.trim()

  if (looksLikeEmail(id)) {
    // On cherche l'utilisateur auth par e-mail, puis son profil.
    const email = id.toLowerCase()
    // getUserByEmail n'existe pas : on filtre les profils dont l'e-mail auth
    // correspond via une jointure impossible ; on liste donc par e-mail auth.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const u = list?.users?.find(x => (x.email ?? "").toLowerCase() === email)
    if (!u) return null
    const { data: prof } = await admin.from("profiles").select("id, telephone, nom, role, status").eq("id", u.id).maybeSingle()
    const p = prof as { id: string; telephone: string | null; nom: string | null; role: string | null; status: string | null } | null
    return { userId: u.id, email: u.email ?? null, telephone: p?.telephone ?? null, nom: p?.nom ?? null, role: p?.role ?? null, status: p?.status ?? null }
  }

  // Téléphone
  const phone = normalizePhone(id)
  if (phoneDigits(phone).length < 8) return null
  const { data: rows } = await admin.from("profiles")
    .select("id, telephone, nom, role, status")
    .in("telephone", phoneMatchCandidates(phone)).limit(1)
  const p = ((rows ?? []) as { id: string; telephone: string | null; nom: string | null; role: string | null; status: string | null }[])[0]
  if (!p) return null
  const { data: u } = await admin.auth.admin.getUserById(p.id)
  return { userId: p.id, email: u.user?.email ?? null, telephone: p.telephone, nom: p.nom, role: p.role, status: p.status }
}

/** Vérifie un couple e-mail / mot de passe. Renvoie l'userId si valide. */
export async function verifyPassword(email: string, password: string): Promise<string | null> {
  const client = statelessAuthClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) return null
  return data.user.id
}
