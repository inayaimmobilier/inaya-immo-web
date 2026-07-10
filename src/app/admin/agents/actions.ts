"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Res = { ok: true } | { ok: false; error: string }
const digits = (s: string) => s.replace(/\D/g, "")

/**
 * Crée un agent immobilier (interne ou externe).
 *  - interne : salarié Inaya → e-mail + mot de passe requis (accès back-office).
 *  - externe : partenaire (autre agence / indépendant) → identifiants facultatifs.
 * Un compte d'authentification est toujours créé (un profil exige un auth.users).
 */
export async function createAgent(input: {
  nom: string; telephone: string; type: "interne" | "externe"
  agence?: string; email?: string | null; password?: string | null
}): Promise<Res> {
  const adminId = await requireAdmin()
  if (!adminId) return { ok: false, error: "Réservé aux administrateurs." }

  const nom = input.nom.trim()
  const tel = input.telephone.replace(/[^\d+]/g, "")
  const type = input.type === "externe" ? "externe" : "interne"
  const realEmail = input.email?.trim().toLowerCase() || null
  const password = input.password?.trim() || randomUUID().slice(0, 12)

  if (!nom) return { ok: false, error: "Le nom est requis." }
  if (digits(tel).length < 8) return { ok: false, error: "Numéro de téléphone invalide." }
  if (type === "interne" && (!realEmail || (input.password || "").trim().length < 6))
    return { ok: false, error: "Un agent interne a besoin d'un e-mail et d'un mot de passe (6 caractères min.) pour se connecter." }

  const email = realEmail ?? `${digits(tel)}@agent.inaya-immo.ci`
  const admin = createAdminClient()

  const { data: existing } = await admin.from("profiles").select("id").eq("telephone", tel).maybeSingle()
  if (existing) return { ok: false, error: "Un compte existe déjà avec ce numéro." }

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nom, telephone: tel },
  })
  if (cErr || !created.user) {
    if (cErr?.message?.toLowerCase().includes("already")) return { ok: false, error: "Un compte existe déjà avec cet e-mail." }
    console.error("INAYA-AGENT-010", cErr)
    return { ok: false, error: "Échec de la création du compte agent." }
  }

  // Le trigger a créé le profil en 'client' → on le passe en 'agent' + type.
  const patch: Record<string, unknown> = {
    role: "agent", nom, telephone: tel,
    agent_type: type, agence: type === "externe" ? (input.agence?.trim() || null) : null,
  }
  let { error: uErr } = await admin.from("profiles").update(patch as never).eq("id", created.user.id)
  if (uErr?.code === "42703") { // colonnes agent_type/agence absentes (migration 024 non appliquée)
    const { agent_type: _t, agence: _a, ...base } = patch
    const retry = await admin.from("profiles").update(base as never).eq("id", created.user.id)
    uErr = retry.error
  }
  if (uErr) { console.error("INAYA-AGENT-011", uErr); return { ok: false, error: "Compte créé mais rôle non appliqué." } }

  revalidatePath("/admin/agents")
  return { ok: true }
}

async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return role && ["super_admin", "admin"].includes(role) ? user.id : null
}

/** Active / suspend le compte d'un agent. */
export async function setAgentStatus(agentId: string, status: "actif" | "suspendu"): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Réservé aux administrateurs." }
  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ status } as never).eq("id", agentId)
  if (error) { console.error("INAYA-AGENT-001", error); return { ok: false, error: "Échec de la mise à jour." } }
  revalidatePath(`/admin/agents/${agentId}`)
  revalidatePath("/admin/agents")
  return { ok: true }
}

/** Modifie les informations d'un agent. */
export async function updateAgent(agentId: string, input: {
  nom: string; prenom?: string; telephone?: string
  agent_type: "interne" | "externe"; agence?: string
}): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Réservé aux administrateurs." }

  const nom = input.nom.trim()
  const prenom = input.prenom?.trim() || null
  const tel = (input.telephone || "").replace(/[^\d+]/g, "") || null
  if (!nom) return { ok: false, error: "Le nom est requis." }

  const admin = createAdminClient()
  if (tel) {
    const { data: dup } = await admin.from("profiles").select("id").eq("telephone", tel).neq("id", agentId).maybeSingle()
    if (dup) return { ok: false, error: "Ce numéro est déjà utilisé par un autre compte." }
  }

  const patch: Record<string, unknown> = {
    nom, prenom, telephone: tel,
    agent_type: input.agent_type,
    agence: input.agent_type === "externe" ? (input.agence?.trim() || null) : null,
  }
  let { error } = await admin.from("profiles").update(patch as never).eq("id", agentId)
  if (error?.code === "42703") {
    const { agent_type: _t, agence: _a, ...base } = patch
    const retry = await admin.from("profiles").update(base as never).eq("id", agentId)
    error = retry.error
  }
  if (error) { console.error("INAYA-AGENT-012", error); return { ok: false, error: "Échec de la mise à jour." } }

  revalidatePath(`/admin/agents/${agentId}`)
  revalidatePath("/admin/agents")
  return { ok: true }
}

/**
 * Supprime un agent : désassigne ses leads/transactions, puis supprime le compte auth
 * (la suppression auth cascade sur profiles via FK).
 */
export async function deleteAgent(agentId: string): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Réservé aux administrateurs." }
  const admin = createAdminClient()

  // Désassigner avant de supprimer pour éviter les violations de FK
  await admin.from("leads").update({ agent_id: null } as never).eq("agent_id", agentId)
  await admin.from("transactions").update({ agent_id: null } as never).eq("agent_id", agentId)

  const { error } = await admin.auth.admin.deleteUser(agentId)
  if (error) { console.error("INAYA-AGENT-013", error); return { ok: false, error: "Échec de la suppression." } }

  revalidatePath("/admin/agents")
  return { ok: true }
}

/**
 * Approuve une candidature agent : octroie le rôle « agent » (externe, avec
 * l'agence indiquée) et marque la candidature comme approuvée. Avant cela, le
 * compte candidat reste role='client' — aucun accès agent tant que ce n'est
 * pas explicitement approuvé ici.
 */
export async function approveAgentApplication(applicationId: string): Promise<Res> {
  const adminId = await requireAdmin()
  if (!adminId) return { ok: false, error: "Réservé aux administrateurs." }
  const admin = createAdminClient()

  const { data: app } = await admin
    .from("agent_applications").select("id, user_id, agence, agence_adresse, statut").eq("id", applicationId).maybeSingle()
  const application = app as { id: string; user_id: string; agence: string | null; agence_adresse: string | null; statut: string } | null
  if (!application) return { ok: false, error: "Candidature introuvable." }
  if (application.statut !== "en_attente") return { ok: false, error: "Cette candidature a déjà été traitée." }

  const patch: Record<string, unknown> = {
    role: "agent", agent_type: "externe",
    agence: application.agence, agence_adresse: application.agence_adresse,
  }
  let { error } = await admin.from("profiles").update(patch as never).eq("id", application.user_id)
  if (error?.code === "42703") {
    const { agence_adresse: _aa, ...base } = patch
    const retry = await admin.from("profiles").update(base as never).eq("id", application.user_id)
    error = retry.error
  }
  if (error) { console.error("INAYA-AGENT-APP-010", error); return { ok: false, error: "Échec de l'octroi du rôle agent." } }

  await admin.from("agent_applications")
    .update({ statut: "approuvee", decided_by: adminId, decided_at: new Date().toISOString() } as never)
    .eq("id", applicationId)

  // Notification best-effort (WhatsApp) — n'échoue jamais l'approbation.
  try {
    const { data: prof } = await admin.from("profiles").select("telephone").eq("id", application.user_id).maybeSingle()
    const tel = (prof as { telephone: string | null } | null)?.telephone
    if (tel) {
      await admin.from("notifications").insert({
        contact_telephone: tel, canal: "whatsapp", type: "candidature_agent_approuvee",
        titre: "Candidature agent approuvée", contenu: "Bonne nouvelle : votre candidature d'agent immobilier Inaya a été validée ! Connectez-vous pour accéder à votre espace agent.",
        payload: {}, lu: false, envoye: false,
      } as never)
    }
  } catch (e) { console.error("INAYA-AGENT-APP-011", e) }

  revalidatePath("/admin/agents")
  return { ok: true }
}

/** Rejette une candidature agent (le compte reste role='client', inchangé). */
export async function rejectAgentApplication(applicationId: string, motif?: string): Promise<Res> {
  const adminId = await requireAdmin()
  if (!adminId) return { ok: false, error: "Réservé aux administrateurs." }
  const admin = createAdminClient()

  const { data: app } = await admin.from("agent_applications").select("statut").eq("id", applicationId).maybeSingle()
  if ((app as { statut?: string } | null)?.statut !== "en_attente") return { ok: false, error: "Cette candidature a déjà été traitée." }

  const { error } = await admin.from("agent_applications")
    .update({ statut: "rejetee", decided_by: adminId, decided_at: new Date().toISOString(), motif_rejet: motif?.trim() || null } as never)
    .eq("id", applicationId)
  if (error) { console.error("INAYA-AGENT-APP-012", error); return { ok: false, error: "Échec du rejet." } }

  revalidatePath("/admin/agents")
  return { ok: true }
}
