import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// CRUD admin des emplacements publicitaires (ad_spaces).
export const runtime = "nodejs"

async function checkAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (prof as { role?: string } | null)?.role
  return role === "super_admin" || role === "admin"
}

export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const admin = createAdminClient()
  const { data, error } = await admin.from("ad_spaces").select("*").order("ordre")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const body = await req.json() as Record<string, unknown>
  // L'id est généré côté base (gen_random_uuid()) — on ne JAMAIS insérer
  // id="" (Postgres rejette avec 22P02 "invalid input syntax for type uuid").
  const payload = { ...body }
  if (payload.id === "" || payload.id == null) delete payload.id
  const admin = createAdminClient()
  const { data, error } = await admin.from("ad_spaces").insert(payload as never).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
