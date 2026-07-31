import { NextRequest, NextResponse } from "next/server"
import { onCallback, onMessage } from "@/lib/telegram/router"

// ============================================================================
// Webhook du bot d'administration Telegram (@InayaImmoBot).
// Règle d'or : TOUJOURS répondre 200. Un code d'erreur pousse Telegram à
// rejouer la même mise à jour en boucle — une action admin serait rejouée
// plusieurs fois. Les erreurs sont donc journalisées, jamais propagées.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Une demande en langage naturel enchaîne plusieurs allers-retours avec le
// modèle et des requêtes en base : mesuré à ~8 s, soit au ras de la limite par
// défaut de 10 s. Au-delà, Vercel tue la fonction AVANT l'envoi de la réponse —
// le bot paraît alors muet. D'où ce plafond largement dimensionné.
export const maxDuration = 60

const OK = () => NextResponse.json({ ok: true })

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expected && req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: {
    message?: { chat?: { id?: number | string }; text?: string; from?: { id: number } }
    callback_query?: {
      id: string; data?: string; from?: { id: number }
      message?: { chat?: { id?: number | string }; message_id?: number }
    }
  }
  try { update = await req.json() } catch { return OK() }

  try {
    const cq = update.callback_query
    if (cq?.data && cq.message?.chat?.id != null && cq.message.message_id != null) {
      await onCallback(String(cq.message.chat.id), cq.message.message_id, cq.data, cq.id)
      return OK()
    }

    const msg = update.message
    if (msg?.text && msg.chat?.id != null) {
      await onMessage(String(msg.chat.id), msg.text, { id: msg.from?.id ?? 0 })
    }
  } catch (e) {
    console.error("INAYA-TG-WEBHOOK", e)
  }
  return OK()
}
