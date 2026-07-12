"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Res = { ok: true } | { ok: false; error: string }

/**
 * Bascule la LIGNE Gupshup active (numéro d'envoi) entre « principal » et
 * « secours ». Stocké dans app_settings 'gupshup_line' = { active }. Lu à chaud
 * par le whatsapp-service (cache 30 s). On notifie aussi le service (/gupshup/line)
 * pour appliquer immédiatement sans attendre l'expiration du cache.
 *
 * Usage : quand Meta RESTREINT le numéro principal, basculer sur « secours » ;
 * une fois la restriction levée, rebasculer sur « principal ».
 */
export async function setGupshupLine(active: "principal" | "secours"): Promise<Res> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role !== "super_admin" && role !== "admin") return { ok: false, error: "Action réservée aux administrateurs." }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "gupshup_line", value: { active }, updated_by: user.id } as never, { onConflict: "key" })
  if (error) {
    console.error("INAYA-GS-LINE-001", error)
    return { ok: false, error: "Échec de l'enregistrement." }
  }

  // Applique immédiatement côté service (best-effort : le cache expire de toute façon).
  try {
    await fetch(`${process.env.WA_SERVICE_URL ?? ""}/gupshup/line`, {
      method: "POST",
      headers: process.env.WA_HTTP_SECRET ? { "x-inaya-secret": process.env.WA_HTTP_SECRET } : {},
      signal: AbortSignal.timeout(3000),
    })
  } catch { /* le service rattrapera via le cache TTL */ }

  revalidatePath("/admin/whatsapp")
  return { ok: true }
}
