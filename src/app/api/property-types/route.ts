import { NextResponse } from "next/server"
import { getPropertyTypes } from "@/lib/property-types-server"

// Public — liste des types de biens ACTIFS (pour les formulaires de recherche).
export async function GET() {
  const types = (await getPropertyTypes())
    .filter(t => t.actif !== false)
    .map(t => ({ code: t.code, label: t.label }))
  return NextResponse.json(types, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
