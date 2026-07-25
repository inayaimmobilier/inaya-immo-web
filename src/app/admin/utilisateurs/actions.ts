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
 * Nombre de super admins ACTIFS autres que `excludeId`. Sert de filet de
 * sécurité pour l'auto-gestion : un super admin peut modifier/supprimer SON
 * PROPRE compte, mais jamais s'il est le dernier super admin actif restant —
 * sinon la plateforme se retrouve verrouillée sans accès possible (incident
 * déjà vécu : un compte altéré ne pouvait pas se réparer lui-même via l'UI).
 */
async function otherActiveSuperAdmins(admin: ReturnType<typeof createAdminClient>, excludeId: string): Promise<number> {
  const { count } = await admin
    .from("profiles").select("id", { count: "exact", head: true })
    .eq("role", "super_admin").eq("status", "actif").neq("id", excludeId)
  return count ?? 0
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

/** Force la vérification/validation d'un compte utilisateur (admin bypass). */
export async function verifyUserAccount(targetId: string): Promise<ActionResult> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const admin = createAdminClient()
  const { error } = await admin.from("profiles")
    .update({ verifie: true, verified_at: new Date().toISOString(), verified_canal: "admin" } as never)
    .eq("id", targetId)

  if (error) {
    console.error("INAYA-USER-VERIFY", error)
    return { ok: false, error: "Échec de la validation du compte." }
  }

  revalidatePath("/admin/utilisateurs")
  revalidatePath(`/admin/utilisateurs/${targetId}`)
  return { ok: true }
}

/** Modifie le rôle d'un utilisateur. */
export async function updateUserRole(targetId: string, role: UserRole): Promise<ActionResult> {
  if (!ROLES.includes(role)) return { ok: false, error: "Rôle invalide." }

  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  // Seul un super_admin peut attribuer ou retirer le rôle super_admin.
  const admin = createAdminClient()
  const { data: targetData } = await admin
    .from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null

  if (!target) return { ok: false, error: "Utilisateur introuvable." }

  if ((role === "super_admin" || target.role === "super_admin") && me.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut gérer le rôle super admin." }

  // Auto-gestion autorisée (y compris sur soi-même), sauf si ça retirerait le
  // dernier super admin actif de la plateforme.
  if (me.id === targetId && target.role === "super_admin" && role !== "super_admin") {
    if (await otherActiveSuperAdmins(admin, me.id) === 0) {
      return { ok: false, error: "Vous êtes le dernier super admin actif. Attribuez d'abord ce rôle à quelqu'un d'autre." }
    }
  }

  const { error } = await admin.from("profiles")
    .update({ role } as never).eq("id", targetId)
  if (error) {
    console.error("INAYA-DB-010", error)
    return { ok: false, error: "Échec de la mise à jour du rôle." }
  }

  revalidatePath("/admin/utilisateurs")
  return { ok: true }
}

/** Modifie les données d'identité d'un utilisateur (nom, prénom, téléphone, commune, e-mail). */
export async function updateUserProfile(targetId: string, input: {
  nom?: string; prenom?: string; telephone?: string; commune?: string; email?: string
}): Promise<ActionResult> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const admin = createAdminClient()
  const { data: targetData } = await admin.from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null
  if (!target) return { ok: false, error: "Utilisateur introuvable." }
  if (target.role === "super_admin" && me.role !== "super_admin" && me.id !== targetId)
    return { ok: false, error: "Seul un super admin peut modifier un super admin." }

  const nom = input.nom?.trim()
  const tel = input.telephone !== undefined ? (input.telephone.replace(/[^\d+]/g, "") || null) : undefined
  const email = input.email?.trim().toLowerCase()

  // Anti-doublon téléphone (hors utilisateur courant).
  if (tel) {
    const { data: dup } = await admin.from("profiles").select("id").eq("telephone", tel).neq("id", targetId).maybeSingle()
    if (dup) return { ok: false, error: "Un autre compte utilise déjà ce numéro." }
  }
  if (email !== undefined && email && !email.includes("@")) return { ok: false, error: "E-mail invalide." }

  // 1. Champs du profil (jeu complet puis repli si une colonne manque : 42703).
  const patch: Record<string, unknown> = {}
  if (nom !== undefined) patch.nom = nom
  if (input.prenom !== undefined) patch.prenom = input.prenom.trim() || null
  if (tel !== undefined) patch.telephone = tel
  if (input.commune !== undefined) patch.commune = input.commune.trim() || null

  if (Object.keys(patch).length) {
    let { error: uErr } = await admin.from("profiles").update(patch as never).eq("id", targetId)
    if (uErr?.code === "42703") {
      const { commune: _c, ...base } = patch
      const retry = await admin.from("profiles").update(base as never).eq("id", targetId)
      uErr = retry.error
    }
    if (uErr) { console.error("INAYA-USER-020", uErr); return { ok: false, error: "Échec de la mise à jour du profil." } }
  }

  // 2. E-mail d'authentification (auth.users) si fourni et modifié.
  if (email) {
    const { error: eErr } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true })
    if (eErr) {
      console.error("INAYA-USER-021", eErr)
      if (eErr.message?.toLowerCase().includes("already")) return { ok: false, error: "Cet e-mail est déjà utilisé." }
      return { ok: false, error: "Profil mis à jour, mais l'e-mail n'a pas pu être changé." }
    }
  }

  revalidatePath("/admin/utilisateurs")
  revalidatePath(`/admin/utilisateurs/${targetId}`)
  return { ok: true }
}

/**
 * Définit un NOUVEAU mot de passe pour un utilisateur (réinitialisation admin).
 * Le mot de passe existant ne peut jamais être lu (haché à sens unique) : on ne
 * peut que le remplacer. Le nouveau mot de passe est renvoyé à l'appelant pour
 * qu'il le communique à l'utilisateur, puis n'est plus jamais récupérable.
 */
export async function setUserPassword(targetId: string, newPassword: string): Promise<ActionResult> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }
  if ((newPassword || "").length < 6) return { ok: false, error: "Le mot de passe doit comporter au moins 6 caractères." }

  const admin = createAdminClient()
  const { data: targetData } = await admin.from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null
  if (!target) return { ok: false, error: "Utilisateur introuvable." }
  if (target.role === "super_admin" && me.role !== "super_admin" && me.id !== targetId)
    return { ok: false, error: "Seul un super admin peut réinitialiser le mot de passe d'un super admin." }

  const { error } = await admin.auth.admin.updateUserById(targetId, { password: newPassword })
  if (error) {
    console.error("INAYA-USER-040", error)
    return { ok: false, error: "Échec de la réinitialisation du mot de passe." }
  }
  return { ok: true }
}

/**
 * Supprime définitivement un utilisateur et ses données.
 * La suppression du compte auth déclenche la cascade sur profiles (et les tables
 * liées via ON DELETE CASCADE). On supprime aussi le profil en filet de sécurité.
 */
export async function deleteUser(targetId: string): Promise<ActionResult> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const admin = createAdminClient()
  const { data: targetData } = await admin.from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null
  if (target?.role === "super_admin" && me.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut supprimer un super admin." }

  // Auto-suppression autorisée, sauf si c'est le dernier super admin actif.
  if (me.id === targetId && target?.role === "super_admin") {
    if (await otherActiveSuperAdmins(admin, me.id) === 0) {
      return { ok: false, error: "Vous êtes le dernier super admin actif. Créez un autre super admin avant de supprimer ce compte." }
    }
  }

  // Détache les références SANS ON DELETE CASCADE (sinon la suppression échoue par
  // violation de clé étrangère). Best-effort : on ignore table/colonne absente
  // (migration non appliquée, etc.). On couvre TOUTES les FK vers profiles(id)
  // recensées dans le schéma — une seule oubliée bloque la suppression.
  const detach = async (table: string, col: string) => {
    try { await admin.from(table).update({ [col]: null } as never).eq(col, targetId) } catch { /* ignore */ }
  }
  const purge = async (table: string, col: string) => {
    try { await admin.from(table).delete().eq(col, targetId) } catch { /* ignore */ }
  }
  // Contenu conservé mais désassocié (on garde l'annonce/la règle, on retire l'auteur).
  await detach("properties", "created_by")
  await detach("properties", "validated_by")
  await detach("leads", "client_id")
  await detach("leads", "agent_id")
  await detach("transactions", "agent_id")
  await detach("transactions", "created_by")
  await detach("property_publishers", "publisher_id")
  await detach("conversations", "user_id")
  await detach("moderation_logs", "decide_par")
  await detach("audit_logs", "user_id")
  await detach("commission_rules_history", "modifie_par")
  await detach("signalements", "traite_par")
  await detach("app_settings", "updated_by")
  await detach("agent_applications", "decided_by")
  // Données strictement personnelles ou logs de suivi → supprimées.
  await purge("search_requests", "user_id")
  await purge("notifications", "user_id")
  await purge("otp_codes", "user_id")
  await purge("lead_followups", "agent_id")   // NOT NULL sans cascade → bloquait les agents
  await purge("signalements", "user_id")
  await purge("favorites", "user_id")

  const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
  if (delErr) {
    console.error("INAYA-USER-030", delErr)
    // Message détaillé : une FK oubliée ou un souci Supabase doit être visible,
    // pas masqué derrière un message générique qui empêche tout diagnostic.
    return { ok: false, error: `Échec de la suppression du compte : ${delErr.message}` }
  }
  // Filet de sécurité si la cascade n'a pas retiré le profil.
  await admin.from("profiles").delete().eq("id", targetId)

  revalidatePath("/admin/utilisateurs")
  return { ok: true }
}

/** Supprime plusieurs comptes d'un coup (réutilise deleteUser : mêmes protections). */
export async function bulkDeleteUsers(ids: string[]): Promise<{ ok: true; deleted: number; failed: number } | { ok: false; error: string }> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }
  if (!ids?.length) return { ok: false, error: "Aucun compte sélectionné." }

  let deleted = 0, failed = 0
  for (const id of ids) {
    const r = await deleteUser(id)
    if (r.ok) deleted++; else failed++
  }
  revalidatePath("/admin/utilisateurs")
  return { ok: true, deleted, failed }
}

/**
 * Valide (ou dévalide) manuellement un compte en attente de vérification OTP —
 * met `verifie` à true/false. Débloque un utilisateur qui n'a pas pu recevoir
 * son code (WhatsApp/SMS/e-mail indisponibles) : sans ça, le middleware le
 * renvoie indéfiniment vers /verifier. Réservé aux administrateurs.
 */
export async function setUserVerified(targetId: string, verifie: boolean): Promise<ActionResult> {
  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ verifie } as never).eq("id", targetId)
  if (error) {
    console.error("INAYA-USER-050", error)
    if (error.code === "42703") return { ok: false, error: "Colonne « verifie » absente : appliquez la migration OTP." }
    return { ok: false, error: "Échec de la validation du compte." }
  }
  revalidatePath("/admin/utilisateurs")
  revalidatePath(`/admin/utilisateurs/${targetId}`)
  return { ok: true }
}

/** Modifie le statut d'un utilisateur (actif / suspendu / banni). */
export async function updateUserStatus(targetId: string, status: UserStatus): Promise<ActionResult> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Statut invalide." }

  const me = await currentProfile()
  if (!me) return { ok: false, error: "Non authentifié." }
  if (me.role !== "super_admin" && me.role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const admin = createAdminClient()
  const { data: targetData } = await admin
    .from("profiles").select("role").eq("id", targetId).single()
  const target = targetData as { role: UserRole } | null
  if (!target) return { ok: false, error: "Utilisateur introuvable." }
  if (target.role === "super_admin" && me.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut suspendre un super admin." }

  // Auto-gestion autorisée, sauf si ça désactiverait le dernier super admin actif.
  if (me.id === targetId && target.role === "super_admin" && status !== "actif") {
    if (await otherActiveSuperAdmins(admin, me.id) === 0) {
      return { ok: false, error: "Vous êtes le dernier super admin actif. Cette action vous verrouillerait hors de la plateforme." }
    }
  }

  const { error } = await admin.from("profiles")
    .update({ status } as never).eq("id", targetId)
  if (error) {
    console.error("INAYA-DB-011", error)
    return { ok: false, error: "Échec de la mise à jour du statut." }
  }

  revalidatePath("/admin/utilisateurs")
  return { ok: true }
}
