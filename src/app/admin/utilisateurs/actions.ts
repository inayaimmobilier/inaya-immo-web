"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole, UserStatus } from "@/types/database"

const ROLES: UserRole[] = [
  "super_admin", "admin", "moderateur", "agent", "client",
  "proprietaire", "locataire", "prestataire", "apporteur", "comptable",
]
const STATUSES: UserStatus[] = ["actif", "suspendu", "banni"]

type ActionResult = { ok: true } | { ok: false; error: string }

/** Renvoie le profil de l'utilisateur courant, ou null. */
async function currentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  const profile = profileData as { role: UserRole } | null
  return profile ? { id: user.id, role: profile.role } : null
}

/**
 * Crée un utilisateur depuis le back-office (n'importe quel rôle).
 * Un compte d'authentification est créé (e-mail + mot de passe) puis le profil
 * est complété (rôle, type d'agent, agence…). Seul un super_admin peut créer un
 * super_admin ; un admin peut créer admin / modérateur / agent / client.
 */
export async function createUser(input: {
  nom: string; prenom?: string; telephone?: string; email: string; password: string
  role: UserRole; agent_type?: "interne" | "externe"; agence?: string
  proprietaire_type?: "diffuseur" | "gere"; metier?: string
}): Promise<ActionResult> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const role = input.role
  if (!ROLES.includes(role)) return { ok: false, error: "Rôle invalide." }
  if (role === "super_admin" && me.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut créer un super admin." }

  const nom = input.nom.trim()
  const prenom = input.prenom?.trim() || null
  const tel = (input.telephone || "").replace(/[^\d+]/g, "") || null
  const email = input.email.trim().toLowerCase()
  if (!nom) return { ok: false, error: "Le nom est requis." }
  if (!email.includes("@")) return { ok: false, error: "E-mail invalide." }
  if ((input.password || "").length < 6) return { ok: false, error: "Mot de passe : 6 caractères minimum." }

  const admin = createAdminClient()
  if (tel) {
    const { data: dup } = await admin.from("profiles").select("id").eq("telephone", tel).maybeSingle()
    if (dup) return { ok: false, error: "Un compte existe déjà avec ce numéro." }
  }

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: input.password, email_confirm: true, user_metadata: { nom, telephone: tel },
  })
  if (cErr || !created.user) {
    if (cErr?.message?.toLowerCase().includes("already")) return { ok: false, error: "Un compte existe déjà avec cet e-mail." }
    console.error("INAYA-USER-010", cErr)
    return { ok: false, error: "Échec de la création du compte." }
  }

  const isExtern = role === "agent" && input.agent_type === "externe"
  const patch: Record<string, unknown> = {
    role, nom, prenom, telephone: tel,
    agent_type: role === "agent" ? (input.agent_type === "externe" ? "externe" : "interne") : null,
    agence: isExtern ? (input.agence?.trim() || null) : null,
    // Sous-type propriétaire (diffuseur/gere) ; métier pour un prestataire.
    proprietaire_type: role === "proprietaire" ? (input.proprietaire_type === "gere" ? "gere" : "diffuseur") : null,
    metier: role === "prestataire" ? (input.metier?.trim() || null) : null,
  }
  let { error: uErr } = await admin.from("profiles").update(patch as never).eq("id", created.user.id)
  if (uErr?.code === "42703") { // colonnes récentes absentes (migrations 024/032 non appliquées) → réessai sans
    const { agent_type: _t, agence: _a, proprietaire_type: _p, metier: _m, ...base } = patch
    const retry = await admin.from("profiles").update(base as never).eq("id", created.user.id)
    uErr = retry.error
  }
  if (uErr) { console.error("INAYA-USER-011", uErr); return { ok: false, error: "Compte créé, mais rôle non appliqué." } }

  revalidatePath("/admin/utilisateurs")
  return { ok: true }
}

/** Modifie le rôle d'un utilisateur. */
export async function updateUserRole(targetId: string, role: UserRole): Promise<ActionResult> {
  if (!ROLES.includes(role)) return { ok: false, error: "Rôle invalide." }

  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  if (me.id === targetId)
    return { ok: false, error: "Vous ne pouvez pas modifier votre propre rôle." }

  // Seul un super_admin peut attribuer ou retirer le rôle super_admin.
  const admin = createAdminClient()
  const { data: targetData } = await admin
    .from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null

  if (!target) return { ok: false, error: "Utilisateur introuvable." }

  if ((role === "super_admin" || target.role === "super_admin") && me.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut gérer le rôle super admin." }

  const { error } = await admin.from("profiles")
    .update({ role } as never).eq("id", targetId)
  if (error) {
    console.error("INAYA-DB-010", error)
    return { ok: false, error: "Échec de la mise à jour du rôle." }
  }

  revalidatePath("/admin/utilisateurs")
  return { ok: true }
}

/** Modifie le statut d'un utilisateur (actif / suspendu / banni). */
export async function updateUserStatus(targetId: string, status: UserStatus): Promise<ActionResult> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Statut invalide." }

  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }
  if (me.id === targetId)
    return { ok: false, error: "Vous ne pouvez pas modifier votre propre statut." }

  const admin = createAdminClient()
  const { data: targetData } = await admin
    .from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null
  if (!target) return { ok: false, error: "Utilisateur introuvable." }
  if (target.role === "super_admin" && me.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut suspendre un super admin." }

  const { error } = await admin.from("profiles")
    .update({ status } as never).eq("id", targetId)
  if (error) {
    console.error("INAYA-DB-011", error)
    return { ok: false, error: "Échec de la mise à jour du statut." }
  }

  revalidatePath("/admin/utilisateurs")
  return { ok: true }
}
