"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole, WaEngine } from "@/types/database"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const ENGINES: WaEngine[] = [
  "baileys", "wppconnect", "whatsmeow", "whatsapp_web_js",
  "venom_bot", "api_officielle", "waapi", "twilio",
]

async function requireAdmin(): Promise<{ id: string; db: SupabaseClient } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const profile = data as { role: UserRole } | null
  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) return null
  return { id: user.id, db: supabase }
}

export async function createWaAccount(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const nom = String(form.get("nom") || "").trim()
  const numero = String(form.get("numero") || "").trim()
  const engine = String(form.get("engine") || "baileys") as WaEngine

  if (!nom) return { ok: false, error: "Le nom du compte est obligatoire." }
  if (!numero) return { ok: false, error: "Le numéro est obligatoire." }
  if (!ENGINES.includes(engine)) return { ok: false, error: "Moteur inconnu." }

  const { data, error } = await admin.db
    .from("whatsapp_accounts")
    .insert({ nom, numero, engine, created_by: admin.id } as never)
    .select("id")
    .single()

  if (error) {
    console.error("INAYA-WA-001", error)
    if (error.code === "23505") return { ok: false, error: "Ce numéro est déjà enregistré." }
    return { ok: false, error: "Échec de la création du compte." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateWaEngine(id: string, engine: WaEngine): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }
  if (!ENGINES.includes(engine)) return { ok: false, error: "Moteur inconnu." }

  const { error } = await admin.db
    .from("whatsapp_accounts").update({ engine } as never).eq("id", id)
  if (error) {
    console.error("INAYA-WA-002", error)
    return { ok: false, error: "Échec du changement de moteur." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true }
}

export async function toggleWaAccount(id: string, actif: boolean): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const { error } = await admin.db
    .from("whatsapp_accounts").update({ actif } as never).eq("id", id)
  if (error) {
    console.error("INAYA-WA-003", error)
    return { ok: false, error: "Échec du changement d'état." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true }
}

export async function deleteWaAccount(id: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const { error } = await admin.db.from("whatsapp_accounts").delete().eq("id", id)
  if (error) {
    console.error("INAYA-WA-004", error)
    return { ok: false, error: "Échec de la suppression." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true }
}

/**
 * Réinitialise le code_erreur des notifications WhatsApp bloquées afin de les remettre
 * dans la file d'attente. Utile lorsqu'un compte WA vient d'être connecté.
 */
export async function retryFailedNotifications(): Promise<ActionResult & { count?: number }> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const db = createAdminClient()
  // Compte d'abord les notifications bloquées, puis efface le code_erreur.
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("canal", "whatsapp")
    .eq("envoye", false)
    .not("code_erreur", "is", null)
  const { error } = await db
    .from("notifications")
    .update({ code_erreur: null, erreur: null } as never)
    .eq("envoye", false)
    .eq("canal", "whatsapp")
    .not("code_erreur", "is", null)
  if (error) {
    console.error("INAYA-NOTIF-040", error)
    return { ok: false, error: "Échec de la remise en file." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true, count: count ?? 0 }
}

/**
 * Annule les alertes de biens « Nouveau bien pour vous » (match_offre) EN ATTENTE :
 * elles ne partiront pas. Anti-ban : sert à vider un backlog d'alertes de match qui
 * s'est emballé (ingestion massive × demandes actives). On ne touche QUE les
 * match_offre WhatsApp en attente — jamais les OTP, tâches ou autres notifications.
 * Neutralisation propre : envoye=true SANS envoye_le → sort de « en attente » sans
 * compter comme « envoyée » (24h) ni « en erreur ».
 */
export async function cancelPendingMatchAlerts(): Promise<ActionResult & { count?: number }> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const db = createAdminClient()
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("canal", "whatsapp").eq("type", "match_offre")
    .eq("envoye", false).is("code_erreur", null)
  const { error } = await db
    .from("notifications")
    .update({ envoye: true, erreur: "annulée (anti-spam)" } as never)
    .eq("canal", "whatsapp").eq("type", "match_offre")
    .eq("envoye", false).is("code_erreur", null)
  if (error) {
    console.error("INAYA-NOTIF-041", error)
    return { ok: false, error: "Échec de l'annulation." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true, count: count ?? 0 }
}

/**
 * Désigne un compte comme notificateur INAYA (identité officielle pour l'envoi des messages).
 * Tous les autres comptes repassent en rôle « ingestion ».
 */
export async function setNotifierAccount(id: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  // Remet tous les comptes en ingestion, puis passe le compte cible en notifier
  await admin.db.from("whatsapp_accounts").update({ role: "ingestion" } as never).neq("id", "00000000-0000-0000-0000-000000000000")
  const { error } = await admin.db.from("whatsapp_accounts").update({ role: "notifier" } as never).eq("id", id)
  if (error) {
    console.error("INAYA-WA-010", error)
    return { ok: false, error: "Échec de la mise à jour du rôle." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true }
}
