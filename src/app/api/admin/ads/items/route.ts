import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// CRUD admin des pubs (ad_items).
export const runtime = "nodejs"

async function checkAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (prof as { role?: string } | null)?.role
  return role === "super_admin" || role === "admin"
}

export async function GET(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const adSpaceId = req.nextUrl.searchParams.get("ad_space_id")
  const admin = createAdminClient()
  let q = admin.from("ad_items").select("*").order("priority", { ascending: false })
  if (adSpaceId) q = q.eq("ad_space_id", adSpaceId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const body = await req.json()
  const admin = createAdminClient()
  const { data, error } = await admin.from("ad_items").insert(body as never).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
