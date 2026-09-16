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

/**
 * Mémoire courte du résultat de la vérification de l'APK.
 *
 * Sans elle, chaque démarrage d'application déclencherait un appel réseau vers
 * l'hébergeur du fichier. Un succès est valable 5 minutes, un échec 1 minute :
 * on veut redevenir bloquant vite après une réparation, sans marteler un
 * hébergeur en panne.
 */
let cacheApk: { url: string; joignable: boolean; expire: number } | null = null

/**
 * Le fichier annoncé se télécharge-t-il vraiment ?
 *
 * Une mise à jour OBLIGATOIRE qui pointe vers un fichier injoignable rend
 * l'application inutilisable : l'écran ne peut pas être passé, et le
 * téléchargement échoue. C'est arrivé deux fois — en août (le numéro déclaré
 * devançait le fichier déposé) et le 16/09/2026 (le stockage Cloudflare R2
 * désactivé, l'APK répondant 403 comme toutes les photos du site).
 *
 * En cas de doute on répond NON : perdre le caractère obligatoire d'une mise à
 * jour est un inconvénient, bloquer tout le parc est une panne.
 */
async function apkJoignable(url: string): Promise<boolean> {
  if (cacheApk && cacheApk.url === url && Date.now() < cacheApk.expire) return cacheApk.joignable

  let joignable = false
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(4000) })
    // Certains hébergeurs refusent HEAD (405) sans que le fichier soit absent :
    // on retente en demandant le premier octet seulement.
    if (r.status === 405 || r.status === 501) {
      r = await fetch(url, {
        method: "GET", redirect: "follow",
        headers: { range: "bytes=0-0" },
        signal: AbortSignal.timeout(4000),
      })
    }
    joignable = r.ok || r.status === 206
  } catch {
    joignable = false
  }

  cacheApk = { url, joignable, expire: Date.now() + (joignable ? 300_000 : 60_000) }
  return joignable
}

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
  const url = await getApkUrl()

  // Le caractère obligatoire est SUBORDONNÉ à l'existence réelle du fichier :
  // sans APK téléchargeable, l'écran de mise à jour n'a rien à proposer et
  // l'application devient inutilisable. On propose alors la mise à jour sans
  // l'imposer, ce qui laisse l'ancienne version fonctionner.
  const demandeForcage = reglages.app_version_forcee === "true"
  const forcee = demandeForcage && !!url && await apkJoignable(url)

  return NextResponse.json({
    // 0 = aucune version annoncée. L'application ne proposera rien.
    versionCode: Number.isFinite(code) && code > 0 ? code : 0,
    versionNom: reglages.app_version_nom || null,
    notes: reglages.app_version_notes || null,
    // Réservé aux mises à jour qu'on ne peut pas laisser de côté (correction de
    // sécurité, rupture de compatibilité avec le serveur).
    forcee,
    url,
  }, {
    // Court, mais non nul : au démarrage de milliers d'applications, une
    // réponse identique n'a pas à être recalculée à chaque fois.
    headers: { "cache-control": "public, max-age=300" },
  })
}
