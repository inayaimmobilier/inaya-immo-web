import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { deleteFromR2, r2Configured, urlToKey } from "@/lib/r2"

export const runtime = "nodejs"

async function checkAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (prof as { role?: string } | null)?.role
  return role === "super_admin" || role === "admin"
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const admin = createAdminClient()
  const payload = { ...body, updated_at: new Date().toISOString() }
  const { data, error } = await admin.from("ad_items").update(payload as never).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const { id } = await params
  const admin = createAdminClient()

  // Récupère les URLs médias pour nettoyer R2 (best-effort)
  const { data: item } = await admin.from("ad_items")
    .select("image_url, video_url").eq("id", id).maybeSingle()
  const it = item as { image_url?: string | null; video_url?: string | null } | null
  if (r2Configured() && it) {
    for (const url of [it.image_url, it.video_url]) {
      if (url) { const k = urlToKey(url); if (k) { try { await deleteFromR2(k) } catch { /* ignore */ } } }
    }
  }

  const { error } = await admin.from("ad_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
