import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// Public — liste les villes actives (pour formulaires publics)
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("villes")
    .select("id,nom")
    .eq("actif", true)
    .order("ordre")
    .order("nom")
  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
