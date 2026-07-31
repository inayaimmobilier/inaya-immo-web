// ============================================================================
// Client minimal de l'API Bot Telegram (envoi, édition, claviers).
// Tout passe par ce module : un seul endroit pour le jeton, l'échappement HTML
// et la gestion d'erreur — le webhook ne doit JAMAIS échouer à cause d'un
// message qui ne part pas (Telegram réessaierait la mise à jour en boucle).
// ============================================================================

const API = "https://api.telegram.org/bot"

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || ""

/** Échappe le texte destiné au parse_mode HTML de Telegram. */
export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export interface Button { text: string; data?: string; url?: string }
export type Keyboard = Button[][]

function markup(kb?: Keyboard) {
  if (!kb?.length) return undefined
  return {
    inline_keyboard: kb.map(row =>
      row.map(b => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "noop" })),
    ),
  }
}

async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = botToken()
  if (!token) { console.error("INAYA-TG-001 TELEGRAM_BOT_TOKEN absent"); return null }
  try {
    const res = await fetch(`${API}${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown }
    if (!data.ok) console.error("INAYA-TG-002", method, data.description)
    return data.result ?? null
  } catch (e) {
    console.error("INAYA-TG-003", method, e)
    return null
  }
}

/** Telegram refuse les messages > 4096 caractères : on coupe proprement. */
const clip = (t: string) => (t.length > 3900 ? `${t.slice(0, 3900)}\n…` : t)

export function tgSend(chatId: string, text: string, kb?: Keyboard) {
  return call("sendMessage", {
    chat_id: chatId, text: clip(text), parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: markup(kb),
  })
}

export function tgPhoto(chatId: string, photoUrl: string, caption: string, kb?: Keyboard) {
  return call("sendPhoto", {
    chat_id: chatId, photo: photoUrl, caption: clip(caption),
    parse_mode: "HTML", reply_markup: markup(kb),
  })
}

export function tgEdit(chatId: string, messageId: number, text: string, kb?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId, message_id: messageId, text: clip(text),
    parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup(kb),
  })
}

/** Acquitte l'appui sur un bouton (sinon le client Telegram tourne en boucle). */
export function tgAnswer(callbackId: string, text?: string, alert = false) {
  return call("answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: alert })
}

export function tgSetCommands(commands: { command: string; description: string }[]) {
  return call("setMyCommands", { commands })
}
