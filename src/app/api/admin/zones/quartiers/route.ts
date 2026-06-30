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

// GET ?ville_id=xxx
export async function GET(req: NextRequest) {
  const err = await checkAdmin(); if (err) return err
  const villeId = req.nextUrl.searchParams.get("ville_id")
  if (!villeId) return NextResponse.json([])
  const admin = createAdminClient()
  const { data } = await admin.from("quartiers").select("id,nom,actif,ordre").eq("ville_id", villeId).order("ordre").order("nom")
  return NextResponse.json(data ?? [])
}

// POST { ville_id, nom }
export async function POST(req: NextRequest) {
  const err = await checkAdmin(); if (err) return err
  const { ville_id, nom } = (await req.json()) as { ville_id: string; nom: string }
  if (!ville_id || !nom?.trim()) return NextResponse.json({ error: "ville_id et nom requis" }, { status: 400 })
  const admin = createAdminClient()
  const { data, error } = await admin.from("quartiers").insert({ ville_id, nom: nom.trim() } as never).select("id,nom,actif,ordre").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json(data)
}
