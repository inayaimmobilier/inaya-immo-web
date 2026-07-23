// ============================================================================
// Session mobile — jeton porteur (Bearer) signé côté serveur.
//   L'app mobile ne parle qu'aux endpoints /api/mobile/* (jamais à Supabase en
//   direct), donc pas besoin d'une session Supabase : un jeton HMAC compact
//   suffit et reste entièrement sous notre contrôle. Format :
//       base64url(payload).base64url(hmacSHA256(payload))
//   Payload = { sub: userId, iat, exp }. Durée de vie 60 jours.
//   Serveur uniquement (secret jamais exposé au client).
// ============================================================================
import { createHmac, timingSafeEqual } from "crypto"

const TTL_DAYS = 60
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000

/**
 * Secret de signature. On privilégie MOBILE_SESSION_SECRET ; à défaut on dérive
 * du service role Supabase (toujours présent côté serveur) — ainsi un jeton
 * reste vérifiable même si la variable dédiée n'est pas encore configurée, tout
 * en restant secret. Ne JAMAIS exposer côté client.
 */
function secret(): string {
  const s = process.env.MOBILE_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error("MOBILE_SESSION_SECRET manquant")
  return `inaya-mobile:${s}`
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")
}
function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadB64).digest())
}

/** Émet un jeton de session pour un utilisateur (id profil = auth uid). */
export function signMobileToken(userId: string): string {
  const now = Date.now()
  const payload = { sub: userId, iat: now, exp: now + TTL_MS }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)))
  return `${payloadB64}.${sign(payloadB64)}`
}

/** Vérifie un jeton et renvoie l'userId, ou null si invalide/expiré/falsifié. */
export function verifyMobileToken(token: string | null | undefined): string | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  try {
    const expected = Buffer.from(sign(payloadB64))
    const given = Buffer.from(sigB64)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as { sub?: string; exp?: number }
    if (!payload.sub || typeof payload.exp !== "number" || payload.exp < Date.now()) return null
    return payload.sub
  } catch {
    return null
  }
}

/** Extrait le Bearer d'un header Authorization et renvoie l'userId (ou null). */
export function userIdFromAuthHeader(header: string | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return verifyMobileToken(m?.[1])
}
