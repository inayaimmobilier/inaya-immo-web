import { NextRequest, NextResponse } from "next/server"
import { runExpirySweep } from "@/lib/property-expiry"
import { runRoomsBackfill } from "@/lib/rooms-backfill"

// ============================================================================
// Tâche planifiée d'HYGIÈNE DU CATALOGUE, une fois par jour :
//   1. expiration des annonces dont la durée de vie est dépassée ;
//   2. rattrapage du nombre de chambres manquant — l'ingestion WhatsApp insère
//      directement en base et laisse ce champ vide pour les studios, qui
//      disparaissaient alors des filtres.
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
  const expiration = await runExpirySweep()
  // Best-effort : un rattrapage en échec ne doit pas faire échouer l'expiration.
  const chambres = await runRoomsBackfill().catch(e => {
    console.error("INAYA-CRON-ROOMS", e)
    return { ok: false, examinees: 0, completees: 0, erreurs: 0 }
  })

  // L'admin doit voir ce nettoyage passer : une expiration en masse qui se
  // déroule en silence est indiscernable d'une panne.
  if (expiration.expired > 0 || (expiration.restant ?? 0) > 0) {
    try {
      const { notifyAdminsTelegram } = await import("@/lib/telegram/notify")
      const reste = expiration.restant ?? 0
      await notifyAdminsTelegram({
        type: "menage_catalogue",
        titre: "🧹 Ménage du catalogue",
        contenu:
          `${expiration.expired} annonce(s) passée(s) en « expirée ».` +
          (reste > 0 ? `\nIl reste ${reste} annonce(s) échue(s), traitées aux prochains passages.` : "") +
          (chambres.completees > 0 ? `\n${chambres.completees} annonce(s) complétée(s) en nombre de chambres.` : ""),
      })
    } catch (e) { console.error("INAYA-CRON-NOTIF", e) }
  }

  return NextResponse.json({ expiration, chambres }, { status: expiration.ok ? 200 : 502 })
}
