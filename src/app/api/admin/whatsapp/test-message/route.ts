import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const WA_SERVICE_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3099"
const WA_HTTP_SECRET = process.env.WA_HTTP_SECRET ?? ""

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const authErr = await checkAdmin()
  if (authErr) return authErr

  const body = (await req.json()) as { text: string; accountId?: string }
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text requis" }, { status: 400 })
  }

  try {
    const res = await fetch(`${WA_SERVICE_URL}/test-message`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(WA_HTTP_SECRET ? { "x-inaya-secret": WA_HTTP_SECRET } : {}),
      },
      body: JSON.stringify({ text: body.text, accountId: body.accountId }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return NextResponse.json({ error: (err as { error?: string }).error ?? "Erreur service", serviceRunning: true }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, serviceRunning: true, ...data })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("timeout")) {
      return NextResponse.json({
        ok: false,
        serviceRunning: false,
        error: "Le service whatsapp-service n'est pas accessible. Assurez-vous qu'il est démarré (`npm run dev` dans whatsapp-service/).",
      }, { status: 503 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
