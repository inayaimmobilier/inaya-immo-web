import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getApkUrl } from "@/lib/app-apk"

// ============================================================================
// DERNIÈRE VERSION DISPONIBLE DE L'APPLICATION.
//
// L'application n'est pas sur le Play Store : personne ne prévient l'utilisateur
// qu'une nouvelle version existe, et personne ne l'installe à sa place. Les
// téléphones restent donc indéfiniment sur la version du jour de l'installation
// — corrections comprises.
//
// L'application interroge cette route au démarrage et compare le numéro de
// build qu'elle porte à celui annoncé ici.
//
// Les valeurs vivent dans `app_settings` et NON dans le code : publier un
// nouvel APK ne doit pas exiger un déploiement du site. Un administrateur les
// met à jour depuis Admin → Paramètres au moment où il dépose l'APK.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Clés lues dans `app_settings`. */
const CLES = [
  "app_version_code",   // numéro de build de la dernière version (entier)
  "app_version_nom",    // « 1.2.0 », affiché à l'utilisateur
  "app_version_notes",  // ce que la mise à jour apporte, en clair
  "app_version_forcee", // "true" → l'écran ne peut pas être ignoré
] as const

export async function GET() {
  let reglages: Record<string, string> = {}
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("key, value").in("key", CLES as unknown as string[])
    for (const l of (data ?? []) as { key: string; value: unknown }[]) {
      if (typeof l.value === "string") reglages[l.key] = l.value
    }
  } catch {
    // Base injoignable : on répond quand même, avec un numéro nul. L'application
    // conclura qu'elle est à jour plutôt que d'inquiéter pour rien.
    reglages = {}
  }

  const code = Number.parseInt(reglages.app_version_code ?? "", 10)

  return NextResponse.json({
    // 0 = aucune version annoncée. L'application ne proposera rien.
    versionCode: Number.isFinite(code) && code > 0 ? code : 0,
    versionNom: reglages.app_version_nom || null,
    notes: reglages.app_version_notes || null,
    // Réservé aux mises à jour qu'on ne peut pas laisser de côté (correction de
    // sécurité, rupture de compatibilité avec le serveur).
    forcee: reglages.app_version_forcee === "true",
    url: await getApkUrl(),
  }, {
    // Court, mais non nul : au démarrage de milliers d'applications, une
    // réponse identique n'a pas à être recalculée à chaque fois.
    headers: { "cache-control": "public, max-age=300" },
  })
}
