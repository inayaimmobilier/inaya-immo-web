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

export async function GET() {
  const err = await checkAdmin(); if (err) return err
  const admin = createAdminClient()
  const { data } = await admin.from("villes").select("id,nom,actif,ordre").order("ordre").order("nom")
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const err = await checkAdmin(); if (err) return err
  const { nom } = (await req.json()) as { nom: string }
  if (!nom?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 })
  const admin = createAdminClient()
  // Nouvelle commune ajoutée EN FIN de liste (ordre = max + 1) : elle apparaît
  // partout de façon cohérente et l'admin la remonte ensuite si besoin.
  const { data: last } = await admin.from("villes").select("ordre").order("ordre", { ascending: false }).limit(1).maybeSingle()
  const nextOrdre = ((last as { ordre: number | null } | null)?.ordre ?? -1) + 1
  const { data, error } = await admin.from("villes").insert({ nom: nom.trim(), ordre: nextOrdre } as never).select("id,nom,actif,ordre").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json(data)
}
