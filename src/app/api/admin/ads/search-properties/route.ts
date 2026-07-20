import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// Recherche d'annonces par titre (pour le sélecteur de pub liée).
// Évite de charger toutes les annonces d'un coup (milliers) dans le navigateur.
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
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json([])

  const admin = createAdminClient()
  // Recherche full-text légère par préfixe + ilike sur le titre
  const { data, error } = await admin.from("properties")
    .select("id,titre,quartier,prix,type_offre,categorie")
    .or(`titre.ilike.%${q}%,quartier.ilike.%${q}%`)
    .eq("statut", "publie")
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
