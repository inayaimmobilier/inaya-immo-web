import { NextRequest, NextResponse } from "next/server"
import { refreshPharmaciesDeGarde } from "@/lib/pharmacy-scrape"

// ============================================================================
// Tâche planifiée : collecte quotidienne des pharmacies de garde depuis les
// sources définies par l'admin. Déclenchée par le cron Vercel (voir vercel.json)
// ou manuellement avec le secret. Protégée par CRON_SECRET si défini.
// ============================================================================
export const runtime = "nodejs"
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // pas de secret configuré → best-effort (à durcir en prod)
  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true
  if (req.nextUrl.searchParams.get("secret") === secret) return true
  // Vercel Cron envoie un header dédié.
  if (req.headers.get("x-vercel-cron")) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const r = await refreshPharmaciesDeGarde()
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
