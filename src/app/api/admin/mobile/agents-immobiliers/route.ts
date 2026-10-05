import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"
import {
  ajouterAgentImmobilier, finNumero, lireAgentsImmobiliers, retirerAgentImmobilier,
} from "@/lib/agents-immobiliers"

// ============================================================================
// LISTE DES AGENTS IMMOBILIERS EXTERNES — numéros auxquels la plateforme ne
// répond pas (voir lib/agents-immobiliers). Gérée depuis l'application admin :
// consulter (avec le nombre de demandes de chacun), ajouter, retirer.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const admin = createAdminClient()
  const liste = await lireAgentsImmobiliers(admin, true)

  // Combien de demandes de groupe chaque numéro a-t-il postées ?
  const { data } = await admin.from("search_requests").select("contact_telephone,created_at")
    .eq("canal", "whatsapp").not("contact_telephone", "is", null)
    .order("created_at", { ascending: false }).limit(2000)
  const compte = new Map<string, { n: number; derniere: string }>()
  for (const r of (data ?? []) as { contact_telephone: string; created_at: string }[]) {
    const f = finNumero(r.contact_telephone)
    const c = compte.get(f)
    if (c) c.n++; else compte.set(f, { n: 1, derniere: r.created_at })
  }
  return NextResponse.json({
    agents: liste.map(a => ({
      ...a,
      demandes: compte.get(finNumero(a.telephone))?.n ?? 0,
      derniere_demande: compte.get(finNumero(a.telephone))?.derniere ?? null,
    })),
    droits: { modifier: peut(staff.role, "moderer") },
  })
}

export async function POST(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")
  let corps: { telephone?: string; nom?: string; note?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  try {
    const liste = await ajouterAgentImmobilier(createAdminClient(), { telephone: corps.telephone ?? "", nom: corps.nom, note: corps.note })
    return NextResponse.json({ ok: true, total: liste.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")
  let corps: { telephone?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (finNumero(corps.telephone).length !== 8) return NextResponse.json({ error: "Numéro invalide." }, { status: 400 })
  try {
    const liste = await retirerAgentImmobilier(createAdminClient(), corps.telephone ?? "")
    return NextResponse.json({ ok: true, total: liste.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
