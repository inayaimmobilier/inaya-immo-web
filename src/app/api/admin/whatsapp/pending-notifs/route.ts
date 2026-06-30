import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from("notifications")
    .select("id,canal,type,titre,contenu,contact_telephone,user_id,erreur,created_at")
    .eq("canal", "whatsapp")
    .eq("envoye", false)
    .is("code_erreur", null)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
