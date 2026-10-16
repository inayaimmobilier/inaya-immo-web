import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"
import {
  bloquerPublieur, debloquerPublieur, finNumero, lirePublieursBloques, nettoyerAnnoncesBloquees,
} from "@/lib/publieurs-bloques"

// ============================================================================
// PUBLIEURS BLOQUÉS — gérés depuis l'application admin (voir
// lib/publieurs-bloques) : consulter (avec le nombre d'annonces rattachées),
// bloquer (en nettoyant au besoin ses annonces passées), débloquer.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const admin = createAdminClient()
  const liste = await lirePublieursBloques(admin)
  const avecCompte = await Promise.all(liste.map(async p => {
    const { count } = await admin.from("property_publishers").select("id", { count: "exact", head: true })
      .ilike("contact_phone", `%${finNumero(p.telephone)}%`)
    return { ...p, annonces: count ?? 0 }
  }))
  return NextResponse.json({ publieurs: avecCompte, droits: { modifier: peut(staff.role, "moderer") } })
}

export async function POST(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")
  let corps: { telephone?: string; nom?: string; motif?: string; nettoyer?: boolean }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  const admin = createAdminClient()
  try {
    const liste = await bloquerPublieur(admin, { telephone: corps.telephone ?? "", nom: corps.nom, motif: corps.motif })
    const nettoyage = corps.nettoyer ? await nettoyerAnnoncesBloquees(admin, corps.telephone ?? "") : null
    if (nettoyage) {
      try { const { invaliderCatalogue } = await import("@/lib/property-search"); invaliderCatalogue() } catch { /* sans effet */ }
    }
    return NextResponse.json({ ok: true, total: liste.length, nettoyage })
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
  const liste = await debloquerPublieur(createAdminClient(), corps.telephone ?? "")
  return NextResponse.json({ ok: true, total: liste.length })
}
