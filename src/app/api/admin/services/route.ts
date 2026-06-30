import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

const ALLOWED: UserRole[] = ["super_admin", "admin"]

async function checkAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (!role || !ALLOWED.includes(role)) return null
  return role
}

export async function GET() {
  if (!await checkAuth()) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const admin = createAdminClient()
  const { data } = await admin.from("service_banners").select("*").order("ordre")
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const body = await req.json()
  const admin = createAdminClient()
  const { data, error } = await admin.from("service_banners").insert(body as never).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
