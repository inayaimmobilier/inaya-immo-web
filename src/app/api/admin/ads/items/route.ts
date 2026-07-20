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

// Colonnes uuid : on ne JAMAIS envoyer "" (Postgres le rejette avec 22P02).
// On retire les uuids vides de l'insert et on normalise property_id "" → null.
const UUID_COLS = ["id", "ad_space_id", "property_id"] as const

export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const body = await req.json() as Record<string, unknown>
  const payload: Record<string, unknown> = { ...body }
  // Ne pas forcer l'id côté client — la base fournit gen_random_uuid().
  // Les uuids vides ("") sont soit retirés (id), soit null (property_id).
  for (const col of UUID_COLS) {
    const v = payload[col]
    if (v === "" || v == null) {
      if (col === "id") delete payload[col]
      else payload[col] = null
    }
  }
  const admin = createAdminClient()
  const { data, error } = await admin.from("ad_items").insert(payload as never).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
