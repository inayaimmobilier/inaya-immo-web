import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"
import { isExpoPushToken } from "@/lib/push"

// ============================================================================
// Enregistre / met à jour le jeton push (ExpoPushToken) de l'appareil courant.
//   Bearer requis. Le jeton est UNIQUE : s'il migre vers un autre compte (même
//   téléphone réinstallé), on le réattribue à l'utilisateur connecté.
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  let body: { token?: string; platform?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const token = (body.token ?? "").trim()
  const platform = ["ios", "android", "web"].includes(body.platform ?? "") ? body.platform : null
  if (!isExpoPushToken(token)) return NextResponse.json({ error: "Jeton push invalide." }, { status: 400 })

  const db = createAdminClient()
  // Upsert par token (clé unique) : réattribue au compte courant + rafraîchit last_seen.
  const { error } = await db.from("device_tokens").upsert(
    { user_id: userId, token, platform, last_seen_at: new Date().toISOString() } as never,
    { onConflict: "token" },
  )
  if (error) { console.error("INAYA-PUSH-REG", error.message); return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 }) }

  return NextResponse.json({ ok: true })
}
