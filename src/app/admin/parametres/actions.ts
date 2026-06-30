"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import { setSecret } from "@/lib/secrets"
import { PROVIDER_LIST } from "@/lib/llm"

type ActionResult = { ok: true } | { ok: false; error: string }

export async function saveSettings(form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role !== "super_admin" && role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const str = (k: string) => String(form.get(k) ?? "").trim()
  const canaux = form.getAll("notif_canaux").map(String)
  const followupStatuts = form.getAll("followup_statuts").map(String)

  const moderationPrompt = str("ia_moderation_prompt")
  const updates: { key: string; value: unknown }[] = [
    { key: "nom_plateforme", value: str("nom_plateforme") || "Inaya Immo" },
    { key: "ville_principale", value: str("ville_principale") || "Bouaké" },
    { key: "devise", value: str("devise") || "XOF" },
    { key: "delai_expiration_jours", value: Number(str("delai_expiration_jours")) || 30 },
    { key: "contact_support", value: str("contact_support") },
    { key: "commission_residence_pct", value: Number(str("commission_residence_pct")) || 10 },
    { key: "notif_canaux", value: canaux },
    { key: "followup_frequency_hours", value: Number(str("followup_frequency_hours")) || 24 },
    { key: "followup_statuts", value: followupStatuts.length > 0 ? followupStatuts : ["en_traitement", "contacte", "visite_planifiee"] },
    ...(str("assistant_model") ? [{ key: "assistant_model", value: str("assistant_model") }] : []),
    ...(moderationPrompt ? [{ key: "ia_moderation_prompt", value: moderationPrompt }] : []),
  ]

  for (const u of updates) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: u.key, value: u.value, updated_by: user.id } as never, { onConflict: "key" })
    if (error) {
      console.error("INAYA-SET-001", error)
      return { ok: false, error: "Échec de l'enregistrement des paramètres." }
    }
  }

  // Clés API des fournisseurs IA : on n'enregistre que les champs renseignés
  // (un champ vide conserve la clé existante). Stockage via service_role.
  for (const p of PROVIDER_LIST) {
    const v = String(form.get(`secret_${p.envKey}`) ?? "").trim()
    if (v) await setSecret(p.envKey, v, user.id)
  }

  revalidatePath("/admin/parametres")
  return { ok: true }
}
