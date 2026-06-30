import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { moderateProperty } from "@/lib/moderation"

// Permet à un admin de relancer la modération IA sur une annonce existante.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (!["super_admin", "admin", "moderateur"].includes(role ?? "")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { id } = await params
  const admin = createAdminClient()
  const { data: prop } = await admin
    .from("properties")
    .select("id,titre,description,type_offre,categorie,prix,quartier,ville")
    .eq("id", id)
    .single()

  if (!prop) return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 })

  const result = await moderateProperty(id, prop as never)
  return NextResponse.json(result)
}
