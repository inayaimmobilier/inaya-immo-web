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
  const SEL = "id,titre,quartier,prix,type_offre,categorie"

  // UUID → résolution DIRECTE par id (utilisé pour réafficher le titre d'une
  // annonce déjà liée à une pub ; un ilike sur le titre ne la trouverait jamais).
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
    const { data } = await admin.from("properties").select(SEL).eq("id", q).limit(1)
    return NextResponse.json(data ?? [])
  }

  // Recherche texte sur titre + quartier (caractères de syntaxe .or() retirés).
  const term = q.replace(/[(),]/g, " ").trim()
  if (term.length < 2) return NextResponse.json([])
  const { data, error } = await admin.from("properties")
    .select(SEL)
    .or(`titre.ilike.%${term}%,quartier.ilike.%${term}%`)
    .eq("statut", "publie")
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
