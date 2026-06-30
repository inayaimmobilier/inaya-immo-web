import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const WA_SERVICE_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3099"
const WA_HTTP_SECRET = process.env.WA_HTTP_SECRET ?? ""

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const body = (await req.json()) as { to?: string; text?: string }

  try {
    const res = await fetch(`${WA_SERVICE_URL}/send-direct`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(WA_HTTP_SECRET ? { "x-inaya-secret": WA_HTTP_SECRET } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json() as Record<string, unknown>
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    const msg = (e as Error).message
    const isDown = msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("timeout")
    return NextResponse.json(
      { ok: false, serviceRunning: false, error: isDown
        ? "Service whatsapp-service inaccessible — vérifiez qu'il est démarré (pm2 restart inaya-whatsapp-service)"
        : msg },
      { status: 503 },
    )
  }
}
