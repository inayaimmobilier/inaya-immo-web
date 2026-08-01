import { NextRequest, NextResponse } from "next/server"
import { issueOtp } from "@/lib/otp"
import { resolveAccount, isRealEmail, looksLikeEmail } from "@/lib/mobile-auth"
import { checkBlacklist, BLOCKED_MESSAGE } from "@/lib/blacklist"
import { cleIdentifiant, ipDe, limiteAtteinte, TROP_DE_TENTATIVES } from "@/lib/rate-limit"

// ============================================================================
// Mot de passe oublié — étape 1 : envoi d'un code OTP (WhatsApp par défaut,
// e-mail si l'identifiant est un e-mail réel). Le code réinitialise le mot de passe.
// ============================================================================
export const runtime = "nodejs"

function maskPhone(p: string | null): string {
  const d = (p ?? "").replace(/\D/g, "")
  return d.length < 4 ? "votre numéro" : `•• ${d.slice(-2)}`
}

export async function POST(req: NextRequest) {
  let body: { identifier?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const identifier = (body.identifier ?? "").trim()
  if (!identifier) return NextResponse.json({ error: "Indiquez votre numéro ou e-mail." }, { status: 400 })

  // Chaque appel déclenche un envoi RÉEL (WhatsApp ou SMS facturé). Sans plafond,
  // n'importe qui pouvait faire sonner le téléphone d'un tiers en boucle, à nos frais.
  const fenetre = 15 * 60_000
  if (limiteAtteinte(`forgot:id:${cleIdentifiant(identifier)}`, 3, fenetre) ||
      limiteAtteinte(`forgot:ip:${ipDe(req)}`, 10, fenetre)) {
    return NextResponse.json({ error: TROP_DE_TENTATIVES }, { status: 429 })
  }

  const acc = await resolveAccount(identifier)
  if (!acc) return NextResponse.json({ error: "Aucun compte trouvé pour cet identifiant." }, { status: 404 })

  if ((await checkBlacklist({ telephone: acc.telephone, email: isRealEmail(acc.email) ? acc.email : null })).blocked) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 })
  }

  // Canal : e-mail si l'identifiant est un e-mail réel, sinon WhatsApp sur le numéro.
  const wantEmail = looksLikeEmail(identifier) && isRealEmail(acc.email)
  const canal = wantEmail ? "email" : "whatsapp"
  const destination = wantEmail ? acc.email! : acc.telephone
  if (!destination) return NextResponse.json({ error: "Aucun canal d'envoi disponible pour ce compte." }, { status: 400 })

  const r = await issueOtp(acc.userId, canal, destination)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, canal, masked: wantEmail ? destination : maskPhone(acc.telephone) })
}
