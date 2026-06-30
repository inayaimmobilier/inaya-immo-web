import { NextResponse } from "next/server"
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

export async function GET() {
  const authErr = await checkAdmin()
  if (authErr) return authErr

  try {
    const res = await fetch(`${WA_SERVICE_URL}/health`, {
      headers: WA_HTTP_SECRET ? { "x-inaya-secret": WA_HTTP_SECRET } : {},
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json()
    return NextResponse.json({ serviceRunning: true, ...data })
  } catch {
    return NextResponse.json({ serviceRunning: false, accounts: [] })
  }
}
