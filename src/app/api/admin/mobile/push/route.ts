import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, refus } from "@/lib/admin-mobile"

// ============================================================================
// Téléphone d'un membre du staff → notifications push de l'application admin
// (nouvelle demande, rappels…). Même table que l'application client.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  let body: { token?: string; platform?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  const token = body.token?.trim() ?? ""
  if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) return NextResponse.json({ error: "jeton_invalide" }, { status: 400 })
  const platform = ["ios", "android"].includes(body.platform ?? "") ? body.platform : null
  const { error } = await createAdminClient().from("device_tokens").upsert(
    { user_id: staff.userId, token, platform, last_seen_at: new Date().toISOString() } as never,
    { onConflict: "token" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
