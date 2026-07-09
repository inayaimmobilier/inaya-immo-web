"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Un agent met à jour SON PROPRE profil (identité + agence si externe).
 * Le type d'agent (interne/externe) reste une classification réservée à
 * l'administrateur — non modifiable ici.
 */
export async function updateMyAgentProfile(input: {
  nom: string; prenom?: string; telephone?: string; agence?: string; agenceAdresse?: string
}): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." }

  const admin = createAdminClient()
  const { data: prof } = await admin.from("profiles").select("role, agent_type").eq("id", user.id).maybeSingle()
  const p = prof as { role?: string; agent_type?: string | null } | null
  if (p?.role !== "agent") return { ok: false, error: "Réservé aux comptes agent." }

  const nom = input.nom.trim()
  const prenom = input.prenom?.trim() || null
  const tel = (input.telephone || "").replace(/[^\d+]/g, "") || null
  if (!nom) return { ok: false, error: "Le nom est requis." }

  if (tel) {
    const { data: dup } = await admin.from("profiles").select("id").eq("telephone", tel).neq("id", user.id).maybeSingle()
    if (dup) return { ok: false, error: "Ce numéro est déjà utilisé par un autre compte." }
  }

  const isExterne = p?.agent_type === "externe"
  const patch: Record<string, unknown> = { nom, prenom, telephone: tel }
  if (isExterne) {
    patch.agence = input.agence?.trim() || null
    patch.agence_adresse = input.agenceAdresse?.trim() || null
  }

  let { error } = await admin.from("profiles").update(patch as never).eq("id", user.id)
  if (error?.code === "42703") {
    const { agence: _a, agence_adresse: _aa, ...base } = patch
    const retry = await admin.from("profiles").update(base as never).eq("id", user.id)
    error = retry.error
  }
  if (error) { console.error("INAYA-AGENT-PROFIL-001", error.message); return { ok: false, error: "Échec de la mise à jour." } }

  revalidatePath("/agent")
  revalidatePath("/agent/profil")
  return { ok: true }
}
