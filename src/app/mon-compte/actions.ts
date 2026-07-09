"use server"

import { createClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/** L'utilisateur CONNECTÉ change son propre mot de passe (pas de code requis : la session prouve déjà son identité). */
export async function updateMyPassword(newPassword: string): Promise<Result> {
  if ((newPassword || "").length < 6) return { ok: false, error: "Le mot de passe doit comporter au moins 6 caractères." }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    console.error("INAYA-ACCOUNT-001", error.message)
    return { ok: false, error: "Échec de la mise à jour du mot de passe." }
  }
  return { ok: true }
}
