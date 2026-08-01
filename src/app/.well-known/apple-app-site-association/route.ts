import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// Universal Links iOS — équivalent Apple du fichier assetlinks.json d'Android.
//
// Deux exigences propres à Apple, faciles à manquer :
//  1. le fichier se sert SANS extension et avec le type application/json ;
//  2. l'identifiant est préfixé du Team ID (« ABCDE12345.ci.inaya.immo »), qui
//     n'existe qu'une fois le compte Apple Developer créé.
//
// Le Team ID se règle donc sans redéploiement, via APPLE_TEAM_ID ou le réglage
// `apple_team_id`. Tant qu'il est absent, on renvoie une liste vide : iOS
// conclut que le domaine n'est pas associé et ouvre le site — comportement
// actuel, sans régression.
// ============================================================================
export const dynamic = "force-dynamic"

const BUNDLE = "ci.inaya.immo"

async function teamId(): Promise<string | null> {
  const env = process.env.APPLE_TEAM_ID?.trim()
  if (env) return env
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "apple_team_id").maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    return typeof v === "string" && v.trim() ? v.trim() : null
  } catch { return null }
}

export async function GET() {
  const team = await teamId()

  const body = {
    applinks: {
      details: team ? [{
        appIDs: [`${team}.${BUNDLE}`],
        components: [
          { "/": "/biens/*", comment: "Fiche d'une annonce" },
          { "/": "/immobilier/*", comment: "Pages par quartier" },
          { "/": "/residences", comment: "Résidences meublées" },
        ],
      }] : [],
    },
  }

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      // Apple exige ce type MIME exact, et le fichier sans extension.
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  })
}
