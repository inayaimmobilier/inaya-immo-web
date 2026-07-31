// ============================================================================
// Diffusion de l'activité de la plateforme vers les Telegram des admins.
//   L'envoi part DIRECTEMENT du site, sans passer par le service WhatsApp :
//   ce dernier est régulièrement à l'arrêt, et les alertes admin ne doivent pas
//   dépendre de sa disponibilité. Les notifications en base restent créées par
//   notifyStaff() — ceci s'y ajoute, sans la remplacer.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"
import { esc, tgSend, type Keyboard } from "./api"
import { SITE } from "./ui"

/** Familles d'événements que l'admin peut couper depuis /notifs. */
export const EVENTS = {
  annonce_attente: "Annonces à valider",
  nouveau_lead: "Demandes & réservations",
  signalement: "Signalements",
  inscription: "Nouvelles inscriptions",
  travaux: "Travaux & interventions",
  autre: "Autres événements",
} as const
export type EventKey = keyof typeof EVENTS

export type NotifPrefs = Record<EventKey, boolean>

const DEFAULTS: NotifPrefs = {
  annonce_attente: true, nouveau_lead: true, signalement: true,
  inscription: true, travaux: true, autre: true,
}

const SETTING_KEY = "telegram_events"

export async function getNotifPrefs(): Promise<NotifPrefs> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("value").eq("key", SETTING_KEY).maybeSingle()
    const raw = (data as { value: unknown } | null)?.value
    if (raw && typeof raw === "object") return { ...DEFAULTS, ...(raw as Partial<NotifPrefs>) }
  } catch { /* réglages indisponibles → tout activé */ }
  return { ...DEFAULTS }
}

export async function toggleNotifPref(key: string): Promise<NotifPrefs> {
  const prefs = await getNotifPrefs()
  if (!(key in EVENTS)) return prefs
  const k = key as EventKey
  const next = { ...prefs, [k]: !prefs[k] }
  try {
    const admin = createAdminClient()
    await admin.from("app_settings").upsert({ key: SETTING_KEY, value: next } as never, { onConflict: "key" })
  } catch (e) { console.error("INAYA-TG-PREF", e) }
  return next
}

export function notifKeyboard(prefs: NotifPrefs): Keyboard {
  const rows: Keyboard = (Object.keys(EVENTS) as EventKey[]).map(k => ([
    { text: `${prefs[k] ? "🔔" : "🔕"} ${EVENTS[k]}`, data: `n:${k}:` },
  ]))
  rows.push([{ text: "🏠 Menu", data: "m:home" }])
  return rows
}

/** Rattache un type de notification interne à une famille réglable. */
function familyOf(type: string): EventKey {
  if (type.startsWith("travaux")) return "travaux"
  if (type === "nouveau_lead") return "nouveau_lead"
  if (type === "signalement") return "signalement"
  if (type === "inscription" || type === "nouveau_compte") return "inscription"
  if (type === "annonce_attente" || type === "nouveau_bien") return "annonce_attente"
  return "autre"
}

/** Chats Telegram des administrateurs (les agents ne reçoivent pas la supervision). */
async function adminChats(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("profiles")
      .select("telegram_chat_id")
      .in("role", ["super_admin", "admin"])
      .not("telegram_chat_id", "is", null)
    return (data ?? [])
      .map(r => (r as { telegram_chat_id: string | null }).telegram_chat_id)
      .filter((c): c is string => !!c)
  } catch { return [] }
}

/**
 * Pousse un événement vers les admins connectés. Best-effort et non bloquant :
 * une alerte Telegram ne doit jamais faire échouer l'action métier appelante.
 */
export async function notifyAdminsTelegram(n: {
  type: string; titre: string; contenu: string
  propertyId?: string | null; leadId?: string | null
}): Promise<void> {
  try {
    const prefs = await getNotifPrefs()
    if (!prefs[familyOf(n.type)]) return
    const chats = await adminChats()
    if (!chats.length) return

    const kb: Keyboard = []
    if (n.propertyId) {
      kb.push([{ text: "👁️ Ouvrir l'annonce", data: `p:see:${n.propertyId}` }])
      kb.push([{ text: "🌐 Voir sur le site", url: `${SITE}/biens/${n.propertyId}` }])
    }
    const text = `<b>${esc(n.titre)}</b>\n${esc(n.contenu)}`
    await Promise.all(chats.map(c => tgSend(c, text, kb.length ? kb : undefined)))
  } catch (e) {
    console.error("INAYA-TG-NOTIFY", e)
  }
}
