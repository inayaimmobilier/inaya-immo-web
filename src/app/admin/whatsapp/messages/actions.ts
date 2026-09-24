"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  relancerMessages, supprimerMessages, modifierMessage,
  type ResultatAction,
} from "@/lib/messages-admin"
import type { UserRole } from "@/types/database"

// ============================================================================
// Actions du back-office sur les messages non ingérés.
//
// La logique vit dans `lib/messages-admin.ts`, partagée avec l'application
// d'administration ; ici on ne fait que vérifier le rôle et rafraîchir la page.
// ============================================================================

async function role(): Promise<UserRole | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  return (data as { role: UserRole } | null)?.role ?? null
}

const PEUT_MODERER: UserRole[] = ["super_admin", "admin", "moderateur"]
const PEUT_SUPPRIMER: UserRole[] = ["super_admin", "admin"]

export async function relancerMessagesAction(ids: string[]): Promise<ResultatAction> {
  const r = await role()
  if (!r || !PEUT_MODERER.includes(r)) return { ok: false, traites: 0, ignores: 0, erreur: "Accès refusé." }
  const res = await relancerMessages(ids)
  if (res.ok) revalidatePath("/admin/whatsapp/messages")
  return res
}

export async function supprimerMessagesAction(ids: string[]): Promise<ResultatAction> {
  const r = await role()
  // Supprimer efface le texte d'origine : réservé aux administrateurs.
  if (!r || !PEUT_SUPPRIMER.includes(r)) return { ok: false, traites: 0, ignores: 0, erreur: "Accès refusé." }
  const res = await supprimerMessages(ids)
  if (res.ok) revalidatePath("/admin/whatsapp/messages")
  return res
}

export async function modifierMessageAction(id: string, contenu: string): Promise<ResultatAction> {
  const r = await role()
  if (!r || !PEUT_MODERER.includes(r)) return { ok: false, traites: 0, ignores: 0, erreur: "Accès refusé." }
  const res = await modifierMessage(id, contenu)
  if (res.ok) revalidatePath("/admin/whatsapp/messages")
  return res
}
