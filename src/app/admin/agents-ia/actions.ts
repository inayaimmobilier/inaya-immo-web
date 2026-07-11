"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Res = { ok: true; id?: string } | { ok: false; error: string }

const STAFF = ["super_admin", "admin", "moderateur"]

async function requireStaff(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return !!role && STAFF.includes(role)
}

export interface AgentInput {
  nom: string; role?: string | null; canaux?: string[]
  system_prompt?: string | null; base_connaissance?: string | null; modele?: string | null
}

export async function createAiAgent(input: AgentInput): Promise<Res> {
  if (!await requireStaff()) return { ok: false, error: "Réservé aux administrateurs." }
  const nom = input.nom.trim()
  if (!nom) return { ok: false, error: "Le nom est requis." }
  const admin = createAdminClient()
  const { data, error } = await admin.from("ai_agents").insert({
    nom, role: input.role?.trim() || null, canaux: input.canaux ?? [],
    system_prompt: input.system_prompt?.trim() || null,
    base_connaissance: input.base_connaissance?.trim() || null,
    modele: input.modele?.trim() || null,
  } as never).select("id").single()
  if (error) { console.error("INAYA-AIAGENT-001", error); return { ok: false, error: "Échec de la création." } }
  revalidatePath("/admin/agents-ia")
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateAiAgent(id: string, input: AgentInput): Promise<Res> {
  if (!await requireStaff()) return { ok: false, error: "Réservé aux administrateurs." }
  const nom = input.nom.trim()
  if (!nom) return { ok: false, error: "Le nom est requis." }
  const admin = createAdminClient()
  const { error } = await admin.from("ai_agents").update({
    nom, role: input.role?.trim() || null, canaux: input.canaux ?? [],
    system_prompt: input.system_prompt?.trim() || null,
    base_connaissance: input.base_connaissance?.trim() || null,
    modele: input.modele?.trim() || null,
    updated_at: new Date().toISOString(),
  } as never).eq("id", id)
  if (error) { console.error("INAYA-AIAGENT-002", error); return { ok: false, error: "Échec de la mise à jour." } }
  revalidatePath("/admin/agents-ia")
  return { ok: true }
}

export async function toggleAiAgent(id: string, actif: boolean): Promise<Res> {
  if (!await requireStaff()) return { ok: false, error: "Réservé aux administrateurs." }
  const admin = createAdminClient()
  const { error } = await admin.from("ai_agents").update({ actif, updated_at: new Date().toISOString() } as never).eq("id", id)
  if (error) { console.error("INAYA-AIAGENT-003", error); return { ok: false, error: "Échec." } }
  revalidatePath("/admin/agents-ia")
  return { ok: true }
}

export async function deleteAiAgent(id: string): Promise<Res> {
  if (!await requireStaff()) return { ok: false, error: "Réservé aux administrateurs." }
  const admin = createAdminClient()
  const { error } = await admin.from("ai_agents").delete().eq("id", id)
  if (error) { console.error("INAYA-AIAGENT-004", error); return { ok: false, error: "Échec de la suppression." } }
  revalidatePath("/admin/agents-ia")
  return { ok: true }
}
