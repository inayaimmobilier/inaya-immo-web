import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// Android App Links — fichier de vérification du domaine.
//
// C'est ce fichier qui autorise Android à ouvrir https://www.inaya.ci/biens/…
// dans l'application plutôt que dans le navigateur. Sans lui, le système
// considère le lien comme non vérifié et retombe sur le site.
//
// EMPREINTE À DÉCLARER : une fois l'application publiée, Google re-signe l'APK
// avec SA propre clé (« Play App Signing »). L'empreinte à mettre ici est donc
// celle affichée dans Play Console → Configuration → Intégrité de l'application
// → « Certificat de la clé de signature de l'application » (SHA-256), et NON
// celle du keystore de compilation. On accepte plusieurs empreintes : celle de
// Play pour les installations du magasin, celle du keystore EAS pour les APK
// distribués en test direct.
//
// Elles se règlent sans redéploiement, via le réglage `android_cert_sha256`
// (app_settings) ou la variable ANDROID_CERT_SHA256 (valeurs séparées par des
// virgules).
// ============================================================================
export const dynamic = "force-dynamic"

const PACKAGE = "ci.inaya.immo"

/** Normalise une empreinte : majuscules, octets séparés par « : ». */
function normaliser(raw: string): string | null {
  const hex = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, "")
  if (hex.length !== 64) return null // SHA-256 = 32 octets = 64 caractères hex
  return (hex.match(/.{2}/g) ?? []).join(":")
}

async function empreintes(): Promise<string[]> {
  const brutes: string[] = []
  if (process.env.ANDROID_CERT_SHA256) brutes.push(...process.env.ANDROID_CERT_SHA256.split(","))
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "android_cert_sha256").maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    if (typeof v === "string") brutes.push(...v.split(","))
    else if (Array.isArray(v)) brutes.push(...v.map(String))
  } catch { /* réglage indisponible → on s'en tient à l'environnement */ }

  const vues = new Set<string>()
  for (const b of brutes) {
    const n = normaliser(b)
    if (n) vues.add(n)
  }
  return [...vues]
}

export async function GET() {
  const sha = await empreintes()

  // Aucune empreinte configurée : on renvoie un tableau vide plutôt qu'une
  // valeur inventée. Android conclura simplement que le lien n'est pas vérifié
  // et ouvrira le site — le comportement d'aujourd'hui, sans régression.
  const body = sha.length === 0 ? [] : [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PACKAGE,
      sha256_cert_fingerprints: sha,
    },
  }]

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      // Android relit ce fichier régulièrement ; un cache long retarderait la
      // prise en compte d'une empreinte ajoutée après publication.
      "cache-control": "public, max-age=300",
    },
  })
}
