import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const WA_SERVICE_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3099"
const WA_HTTP_SECRET = process.env.WA_HTTP_SECRET ?? ""

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  try {
    const res = await fetch(`${WA_SERVICE_URL}/dispatch-now`, {
      method: "POST",
      headers: WA_HTTP_SECRET ? { "x-inaya-secret": WA_HTTP_SECRET } : {},
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json() as Record<string, unknown>
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Service non accessible — pm2 restart inaya-whatsapp-service" },
      { status: 503 },
    )
  }
}
