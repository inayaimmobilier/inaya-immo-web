// ============================================================================
// Route interne §6.9 — déclenche le matching d'une annonce fraîchement publiée
// contre toutes les requêtes actives (alertes chercheurs).
//
// Appelée par le whatsapp-service (Railway) après auto-publication d'une annonce
// ingérée via WhatsApp — le moteur de matching + la création des notifications
// vivent côté web, on garde donc une source unique de vérité.
//
// Sécurité : secret partagé = SUPABASE_SERVICE_ROLE_KEY (déjà connu des deux
// services, jamais exposé au client). Pas de nouveau secret à provisionner.
// ============================================================================

import { NextResponse } from "next/server"
import { runMatchingForProperty } from "@/lib/matching"

export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret")
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  let propertyId: string | undefined
  try {
    const body = (await req.json()) as { propertyId?: string }
    propertyId = body.propertyId
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }
  if (!propertyId) {
    return NextResponse.json({ ok: false, error: "propertyId manquant" }, { status: 400 })
  }

  try {
    const matched = await runMatchingForProperty(propertyId)
    if (matched > 0) console.info(`INAYA-MATCH: ${matched} chercheur(s) alerté(s) pour ${propertyId}`)
    return NextResponse.json({ ok: true, matched })
  } catch (e) {
    console.error("INAYA-MATCH-005", (e as Error).message)
    return NextResponse.json({ ok: false, error: "matching_failed" }, { status: 500 })
  }
}
