import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { issueOtp } from "@/lib/otp"
import { normalizePhone, phoneDigits, phoneMatchCandidates } from "@/lib/phone"

// ============================================================================
// Auth mobile — étape 1 : demande d'un code OTP par téléphone.
//   Trouve (ou crée) un profil CLIENT rattaché au numéro, puis envoie un code
//   via WhatsApp (canal fiable en Côte d'Ivoire). Ne renvoie JAMAIS le code.
//   Passwordless : le compte auth est créé avec un e-mail synthétique + mot de
//   passe aléatoire ; l'identité se prouve par le code reçu (verify).
// ============================================================================
export const runtime = "nodejs"

const SYNTH_EMAIL_DOMAIN = "auto.inaya-immo.ci"
const synthEmail = (phone: string) => `${phoneDigits(phone)}@${SYNTH_EMAIL_DOMAIN}`
const randomPassword = () =>
  `Inaya!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "")
  return d.length < 4 ? p : `${"•".repeat(Math.max(0, d.length - 2))}${d.slice(-2)}`
}

export async function POST(req: NextRequest) {
  let body: { telephone?: string; nom?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const telephone = normalizePhone(body.telephone ?? "")
  const nom = (body.nom ?? "").trim() || null
  if (phoneDigits(telephone).length < 8) {
    return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 })
  }

  const admin = createAdminClient()

  // Profil déjà rattaché à ce numéro ? (matching tolérant local ⇄ +225.)
  const { data: existRows } = await admin.from("profiles")
    .select("id, telephone, role, statut")
    .in("telephone", phoneMatchCandidates(telephone)).limit(1)
  const existing = ((existRows ?? []) as { id: string; telephone: string | null; role: string | null; statut: string | null }[])[0] ?? null

  if (existing && (existing.statut === "suspendu" || existing.statut === "banni")) {
    return NextResponse.json({ error: "Ce compte est momentanément indisponible. Contactez Inaya." }, { status: 403 })
  }

  let userId = existing?.id ?? null

  // Création d'un nouveau compte client passwordless si aucun profil.
  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: synthEmail(telephone),
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { telephone, ...(nom ? { nom } : {}) },
    })
    if (createErr || !created?.user) {
      // Course possible : un compte a été créé entre-temps → on le retrouve.
      const { data: retry } = await admin.from("profiles")
        .select("id").in("telephone", phoneMatchCandidates(telephone)).limit(1)
      userId = ((retry ?? []) as { id: string }[])[0]?.id ?? null
      if (!userId) {
        console.error("INAYA-MAUTH-001", createErr?.message)
        return NextResponse.json({ error: "Impossible de créer le compte. Réessayez." }, { status: 500 })
      }
    } else {
      userId = created.user.id
      // Profil (créé par trigger auth) : renseigne rôle client + téléphone + nom.
      const patch: Record<string, unknown> = { telephone, role: "client" }
      if (nom) patch.nom = nom
      let { error } = await admin.from("profiles").update(patch as never).eq("id", userId)
      if (error?.code === "42703") {
        const r2 = await admin.from("profiles").update({ telephone, role: "client" } as never).eq("id", userId)
        error = r2.error
      }
      if (error) console.error("INAYA-MAUTH-002", error.message)
    }
  }

  const r = await issueOtp(userId, "whatsapp", telephone)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  return NextResponse.json({
    ok: true,
    canal: "whatsapp",
    phoneMasked: maskPhone(telephone),
    isNew: !existing,
  })
}
