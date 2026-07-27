import { NextRequest, NextResponse } from "next/server"
import { runExpirySweep } from "@/lib/property-expiry"

// ============================================================================
// Tâche planifiée : expiration automatique des annonces. Passe en « expire »
// les annonces publiées dont la durée de vie (règles admin) est dépassée.
// Déclenchée par le cron Vercel (vercel.json) ou manuellement (secret).
// ============================================================================
export const runtime = "nodejs"
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true
  if (req.nextUrl.searchParams.get("secret") === secret) return true
  if (req.headers.get("x-vercel-cron")) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const r = await runExpirySweep()
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
