import { NextResponse } from "next/server"
import { lireNumerosContact } from "@/lib/numeros-contact"

// Public — numéros de contact d'Inaya (barre du site, application mobile).
export async function GET() {
  const numeros = await lireNumerosContact()
  return NextResponse.json({ numeros }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  })
}
