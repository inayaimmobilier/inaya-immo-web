import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-telegram-bot-api-secret-token")
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret && secret !== webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update?.message as Record<string, unknown> | undefined
  if (!message) return NextResponse.json({ ok: true })

  const chat = message?.chat as Record<string, unknown> | undefined
  const chatId = chat?.id != null ? String(chat.id) : null
  const text = (message?.text as string | undefined) ?? ""
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!chatId || !text || !botToken) return NextResponse.json({ ok: true })

  // /start <agent_uuid> — enregistrement du chat_id dans profiles
  const startMatch = text.match(/^\/start\s+([0-9a-f-]{36})$/i)
  if (startMatch) {
    const agentId = startMatch[1]
    const db = createAdminClient()

    const { data: profile } = await db
      .from("profiles")
      .select("id,nom,prenom,role")
      .eq("id", agentId)
      .in("role", ["agent", "moderateur", "admin", "super_admin"])
      .single()

    if (!profile) {
      await tgSend(botToken, chatId, "❌ Lien invalide ou expiré. Demandez un nouveau lien à votre administrateur.")
      return NextResponse.json({ ok: true })
    }

    await db.from("profiles").update({ telegram_chat_id: chatId } as never).eq("id", agentId)
    const p = profile as { nom: string | null; prenom: string | null }
    const name = `${p.prenom || ""} ${p.nom || ""}`.trim() || "Agent"
    await tgSend(botToken, chatId,
      `✅ Bonjour ${name} ! Votre Telegram est maintenant connecté à Inaya Immo.\n\nVous recevrez vos assignations et notifications de leads directement dans cette conversation.`
    )
  }

  return NextResponse.json({ ok: true })
}

async function tgSend(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {})
}
