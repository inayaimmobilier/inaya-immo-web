// ============================================================================
// Envoi de notifications push aux appareils mobiles (Expo Push API).
//   Les clients connectés enregistrent leur ExpoPushToken (table device_tokens).
//   Ici on livre un message à TOUS les appareils d'un utilisateur, en nettoyant
//   les jetons devenus invalides (DeviceNotRegistered). Best-effort : n'échoue
//   jamais l'appelant (une alerte ne doit pas casser si le push tombe).
//   Serveur uniquement (service_role).
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, unknown>
}

type ExpoTicket = {
  status: "ok" | "error"
  message?: string
  details?: { error?: string }
}

/** Un ExpoPushToken valide : « ExponentPushToken[…] » ou « ExpoPushToken[…] ». */
export function isExpoPushToken(t: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t)
}

async function loadTokens(userId: string): Promise<string[]> {
  const db = createAdminClient()
  const { data } = await db.from("device_tokens").select("token").eq("user_id", userId)
  return ((data ?? []) as { token: string }[]).map(r => r.token).filter(isExpoPushToken)
}

async function deleteTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return
  const db = createAdminClient()
  await db.from("device_tokens").delete().in("token", tokens)
    .then(() => {}, (e: unknown) => console.error("INAYA-PUSH-DEL", (e as Error).message))
}

/**
 * Envoie `msg` à tous les appareils de `userId`. Retourne le nombre de tickets
 * « ok ». Purge les jetons rejetés (DeviceNotRegistered).
 */
export async function sendExpoPushToUser(userId: string, msg: PushMessage): Promise<number> {
  const tokens = await loadTokens(userId)
  if (!tokens.length) return 0
  return sendExpoPushToTokens(tokens, msg)
}

/** Envoi direct à une liste de jetons (chunké par 100, limite de l'API Expo). */
export async function sendExpoPushToTokens(tokens: string[], msg: PushMessage): Promise<number> {
  const valid = tokens.filter(isExpoPushToken)
  if (!valid.length) return 0

  let okCount = 0
  const toPurge: string[] = []

  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100)
    const payload = chunk.map(to => ({
      to,
      title: msg.title,
      body: msg.body,
      sound: "default",
      channelId: "default",
      priority: "high",
      ...(msg.data ? { data: msg.data } : {}),
    }))

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] }
      const tickets = json.data ?? []
      tickets.forEach((t, idx) => {
        if (t.status === "ok") okCount++
        else if (t.details?.error === "DeviceNotRegistered") toPurge.push(chunk[idx])
      })
    } catch (e) {
      console.error("INAYA-PUSH-SEND", (e as Error).message)
    }
  }

  await deleteTokens(toPurge)
  return okCount
}
