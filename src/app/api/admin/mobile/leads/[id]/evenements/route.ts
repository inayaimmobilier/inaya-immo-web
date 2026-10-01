import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, refus } from "@/lib/admin-mobile"

// ============================================================================
// HISTORIQUE DES ÉCHANGES — l'application signale chaque appel, WhatsApp ou
// SMS lancé depuis la fiche d'un lead : qui a contacté qui, et quand. Un
// collègue qui reprend le dossier sait où on en est sans rappeler le client.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TYPES = ["appel", "whatsapp", "sms"] as const
const CIBLES = ["demandeur", "proprietaire"] as const

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const { id } = await ctx.params
  let corps: { type?: string; cible?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  const type = TYPES.find(t => t === corps.type)
  const cible = CIBLES.find(c => c === corps.cible) ?? null
  if (!type) return NextResponse.json({ error: "type_inconnu" }, { status: 400 })

  const { journaliser } = await import("@/lib/lead-suivi")
  await journaliser(createAdminClient(), id, { type, cible, auteurId: staff.userId })
  return NextResponse.json({ ok: true })
}
