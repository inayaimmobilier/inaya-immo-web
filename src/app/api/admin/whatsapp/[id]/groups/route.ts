import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"

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

// GET → liste des groupes détectés pour ce compte
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkAdmin()
  if (authErr) return authErr
  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("whatsapp_groups")
    .select("id,nom,nb_participants,last_seen_at")
    .eq("account_id", id)
    .order("nom")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST → met à jour groupes_surveilles pour ce compte
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkAdmin()
  if (authErr) return authErr
  const { id } = await params

  const body = (await req.json()) as { groupes: { id: string; nom: string }[] }
  if (!Array.isArray(body.groupes)) return NextResponse.json({ error: "groupes requis" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from("whatsapp_accounts")
    .update({ groupes_surveilles: body.groupes } as never)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
