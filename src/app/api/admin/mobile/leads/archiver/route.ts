import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// GRAND NETTOYAGE — les leads « nouveau » restés sans suite depuis plus de N
// jours (30 par défaut) passent « abandonné », avec une note qui le dit. La
// liste repart propre et les demandes du jour ne sont plus noyées. Réversible :
// on peut toujours remettre un dossier à une autre étape.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "supprimer")) return refus("acces_refuse")

  let corps: { jours?: number; simulation?: boolean } = {}
  try { corps = await req.json() } catch { /* valeurs par défaut */ }
  const jours = Math.max(7, Math.min(365, Math.round(corps.jours ?? 30)))
  const avant = new Date(Date.now() - jours * 86_400_000).toISOString()
  const admin = createAdminClient()

  const { data } = await admin.from("leads").select("id,compte_rendu")
    .eq("statut", "nouveau").lt("created_at", avant).limit(1000)
  const lignes = (data ?? []) as { id: string; compte_rendu: string | null }[]
  if (corps.simulation) return NextResponse.json({ ok: true, concernes: lignes.length, jours })

  const { journaliser } = await import("@/lib/lead-suivi")
  const note = `Classé « abandonné » automatiquement : resté sans suite plus de ${jours} jours.`
  let faits = 0
  for (const l of lignes) {
    const { error } = await admin.from("leads").update({
      statut: "abandonne", compte_rendu: [l.compte_rendu, note].filter(Boolean).join("\n"),
    } as never).eq("id", l.id)
    if (error) continue
    faits++
    await journaliser(admin, l.id, { type: "archivage", auteurId: staff.userId, detail: note })
  }
  return NextResponse.json({ ok: true, archives: faits, jours })
}
