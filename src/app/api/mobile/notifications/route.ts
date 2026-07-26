import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

// ============================================================================
// Notifications in-app de l'utilisateur (canal « push ») — pour la cloche.
//   GET  : liste (50 dernières).  POST { markRead:true } : tout marquer lu.
// ============================================================================
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin.from("notifications")
    .select("id, type, titre, contenu, payload, lu, created_at")
    .eq("user_id", userId).eq("canal", "push")
    .order("created_at", { ascending: false }).limit(50)

  const items = (data ?? []) as { id: string; type: string; titre: string | null; contenu: string; payload: Record<string, unknown>; lu: boolean; created_at: string }[]
  const unread = items.filter(n => !n.lu).length
  return NextResponse.json({ items, unread })
}

export async function POST(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  let body: { markRead?: boolean }
  try { body = await req.json() } catch { body = {} }
  if (body.markRead) {
    const admin = createAdminClient()
    await admin.from("notifications").update({ lu: true } as never)
      .eq("user_id", userId).eq("canal", "push").eq("lu", false)
      .then(() => {}, () => {})
  }
  return NextResponse.json({ ok: true })
}
