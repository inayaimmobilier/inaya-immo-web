import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// Secrets (clés API fournisseurs IA) saisis depuis l'admin et stockés dans la
// table api_secrets (accès service_role uniquement). Jamais renvoyés au client.
// ============================================================================

/** Valeur d'un secret, ou null si absent/vide. */
export async function getSecret(name: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("api_secrets").select("value").eq("name", name).maybeSingle()
    const v = (data as { value: string } | null)?.value
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

/** Crée ou met à jour un secret (réservé aux appels serveur déjà autorisés). */
export async function setSecret(name: string, value: string, userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from("api_secrets").upsert(
    { name, value, updated_by: userId, updated_at: new Date().toISOString() } as never,
    { onConflict: "name" },
  )
}

/** Noms des secrets configurés (pour afficher l'état dans l'admin — sans la valeur). */
export async function configuredSecretNames(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("api_secrets").select("name")
    return ((data ?? []) as { name: string }[]).map(s => s.name)
  } catch {
    return []
  }
}
