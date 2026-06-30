import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (p as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await checkAdmin(); if (err) return err
  const { id } = await params
  const body = (await req.json()) as { actif?: boolean }
  const admin = createAdminClient()
  const { error } = await admin.from("quartiers").update(body as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await checkAdmin(); if (err) return err
  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from("quartiers").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
