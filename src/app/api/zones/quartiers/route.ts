import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// Public — liste les quartiers actifs.
// ?ville_id=UUID  → quartiers de cette ville uniquement
// (sans param)    → tous les quartiers (pour les filtres du catalogue)
export async function GET(req: NextRequest) {
  const villeId = req.nextUrl.searchParams.get("ville_id")

  const admin = createAdminClient()
  let q = admin.from("quartiers").select("id,nom").eq("actif", true).order("ordre").order("nom")
  if (villeId) q = q.eq("ville_id", villeId)

  const { data, error } = await q
  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
