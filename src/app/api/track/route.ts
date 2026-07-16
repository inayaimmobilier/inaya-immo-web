// ============================================================================
// Suivi de fréquentation first-party (anonyme). Appelé par VisitTracker à chaque
// navigation sur une page PUBLIQUE. Enregistre une vue (visiteur aléatoire, chemin,
// référent) — aucune donnée personnelle. Best-effort : n'échoue jamais côté client.
// ============================================================================

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { vid, path, referrer } = (await req.json()) as { vid?: string; path?: string; referrer?: string }
    if (!vid || !path) return NextResponse.json({ ok: true }) // rien à tracer, on ignore

    // On ne trace JAMAIS les espaces privés (admin, comptes) ni les pages d'auth.
    if (/^\/(admin|client|proprietaire|locataire|prestataire|apporteur|agent|connexion|inscription|verifier|api)\b/.test(path)) {
      return NextResponse.json({ ok: true })
    }

    const admin = createAdminClient()
    await admin.from("page_views").insert({
      visitor_id: String(vid).slice(0, 64),
      path: String(path).slice(0, 300),
      referrer: referrer ? String(referrer).slice(0, 300) : null,
    } as never)
    return NextResponse.json({ ok: true })
  } catch {
    // Table absente (migration 043 non appliquée) ou JSON invalide → on ignore.
    return NextResponse.json({ ok: true })
  }
}
