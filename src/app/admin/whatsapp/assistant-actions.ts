"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Res = { ok: true } | { ok: false; error: string }

/**
 * Active / met en pause l'assistant IA WhatsApp (répond aux DM du numéro Inaya).
 * Stocké dans app_settings 'wa_assistant' = { actif }. Lu par le whatsapp-service.
 */
export async function setWaAssistant(actif: boolean): Promise<Res> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role !== "super_admin" && role !== "admin") return { ok: false, error: "Action réservée aux administrateurs." }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "wa_assistant", value: { actif }, updated_by: user.id } as never, { onConflict: "key" })
  if (error) {
    console.error("INAYA-ASSIST-SET-001", error)
    return { ok: false, error: "Échec de l'enregistrement." }
  }
  revalidatePath("/admin/whatsapp")
  return { ok: true }
}
