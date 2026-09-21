import { NextRequest, NextResponse } from "next/server"
import { tournee } from "@/lib/automations-agent"

// ============================================================================
// LA TOURNÉE QUOTIDIENNE DES ENVOIS AUTOMATIQUES.
//
// Déclenchée par le cron Vercel à 8 h (la Côte d'Ivoire est à l'heure UTC,
// donc 8 h ici est 8 h là-bas). Personne ne reçoit de message en pleine nuit.
//
// Si l'interrupteur général est sur « pause » — sa valeur de départ — la
// tournée ne fait rien et le dit. Ce n'est pas une panne : c'est l'état voulu
// tant que l'administration n'a pas allumé la fonction en connaissance de
// cause.
//
// L'administration est prévenue par Telegram dès que des messages partent :
// un envoi automatique qui se déroule en silence est indiscernable d'une
// panne, dans un sens comme dans l'autre.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function autorise(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true
  if (req.nextUrl.searchParams.get("secret") === secret) return true
  if (req.headers.get("x-vercel-cron")) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const bilan = await tournee()

  if (!bilan.actif) {
    return NextResponse.json({
      ok: true,
      actif: false,
      message: "Envois automatiques en pause (app_settings.agent_automations).",
    })
  }

  if (bilan.envoyes > 0 || bilan.echecs > 0 || bilan.plafonds.length > 0) {
    try {
      const { notifyAdminsTelegram } = await import("@/lib/telegram/notify")
      await notifyAdminsTelegram({
        type: "automation",
        titre: `Envois automatiques : ${bilan.envoyes} parti(s)`,
        contenu: [
          `${bilan.envoyes} message(s) envoyé(s), ${bilan.echecs} en échec.`,
          ...bilan.detail.map(d => `• ${d.agent} — ${d.type} : ${d.envoyes}`),
          ...bilan.plafonds.map(p => `⚠️ ${p}`),
        ].join("\n"),
      })
    } catch (e) {
      // Une notification manquée ne doit pas faire échouer la tournée.
      console.error("INAYA-CRON-AUTO-TG", e)
    }
  }

  return NextResponse.json({ ok: true, ...bilan })
}
