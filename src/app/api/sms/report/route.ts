import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// COMPTE RENDU d'envoi par le téléphone passerelle.
//
// Sans ce retour, un message resterait « en cours d'envoi » indéfiniment et
// serait remis dans la file cinq minutes plus tard — donc envoyé deux fois.
// C'est cet accusé qui rend la file fiable.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f-]{36}$/i

function jetonValide(req: NextRequest): boolean {
  const attendu = process.env.SMS_GATEWAY_TOKEN
  if (!attendu) return false
  const entete = req.headers.get("authorization")
  const fourni = entete?.match(/^Bearer\s+(.+)$/i)?.[1] ?? req.nextUrl.searchParams.get("token")
  return fourni === attendu
}

export async function POST(req: NextRequest) {
  if (!jetonValide(req)) return NextResponse.json({ error: "non_autorise" }, { status: 401 })

  let body: { resultats?: { id?: string; ok?: boolean; erreur?: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "corps_invalide" }, { status: 400 }) }
  const resultats = (body.resultats ?? []).filter(r => r?.id && UUID.test(r.id))
  if (resultats.length === 0) return NextResponse.json({ ok: true, traites: 0 })

  const admin = createAdminClient()
  const maintenant = new Date().toISOString()
  let traites = 0

  for (const r of resultats) {
    const patch = r.ok
      ? { statut: "envoye", envoye_le: maintenant, erreur: null }
      : { statut: "echec", erreur: (r.erreur ?? "envoi refusé par le téléphone").slice(0, 300) }
    const { error } = await admin.from("sms_queue").update(patch as never).eq("id", r.id!)
    if (error) console.error("INAYA-SMSQ-REPORT", r.id, error.message)
    else traites++
  }

  return NextResponse.json({ ok: true, traites })
}
