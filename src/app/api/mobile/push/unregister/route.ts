import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

// ============================================================================
// Supprime le jeton push de l'appareil (déconnexion). Bearer requis. On ne
// supprime QUE si le jeton appartient bien à l'utilisateur connecté.
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  let body: { token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const token = (body.token ?? "").trim()
  if (!token) return NextResponse.json({ error: "Jeton manquant." }, { status: 400 })

  const db = createAdminClient()
  await db.from("device_tokens").delete().eq("token", token).eq("user_id", userId)
    .then(() => {}, (e: unknown) => console.error("INAYA-PUSH-UNREG", (e as Error).message))

  return NextResponse.json({ ok: true })
}
