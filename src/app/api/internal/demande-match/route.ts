// ============================================================================
// Route interne — réponse automatique à une DEMANDE ingérée d'un groupe WhatsApp.
// Appelée par le whatsapp-service après enregistrement d'une demande : cherche les
// biens correspondants et crée UN message WhatsApp direct pour le demandeur.
// Sécurité : secret partagé = SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { NextResponse } from "next/server"
import { respondToDemande } from "@/lib/demande-match"

export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret")
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  let requestId: string | undefined
  try {
    requestId = ((await req.json()) as { requestId?: string }).requestId
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }
  if (!requestId) return NextResponse.json({ ok: false, error: "requestId manquant" }, { status: 400 })

  try {
    const r = await respondToDemande(requestId)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error("INAYA-DEMANDE-005", (e as Error).message)
    return NextResponse.json({ ok: false, error: "demande_match_failed" }, { status: 500 })
  }
}
