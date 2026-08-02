import { createAdminClient } from "@/lib/supabase/server"

/**
 * Adresse de l'APK de l'application mobile, réglable dans Admin → Paramètres
 * (clé `app_apk_url`).
 *
 * Définition PARTAGÉE entre la page /telecharger et la bannière du site : deux
 * lectures parallèles finiraient par diverger, et l'une proposerait un
 * téléchargement que l'autre juge absent.
 *
 * Renvoie `null` tant que rien n'est configuré — et le vérifie vraiment
 * (`startsWith("http")`) : une chaîne vide ou un chemin relatif produirait un
 * bouton qui ne télécharge rien, ce qui est pire que pas de bouton du tout.
 */
export async function getApkUrl(): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "app_apk_url").maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    return typeof v === "string" && v.startsWith("http") ? v : null
  } catch { return null }
}
