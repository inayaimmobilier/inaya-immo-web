import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { ipDe, limiteAtteinte, TROP_DE_TENTATIVES } from "@/lib/rate-limit"
import { signMobileToken } from "@/lib/mobile-session"
import { synthEmail } from "@/lib/mobile-auth"
import { checkBlacklist, BLOCKED_MESSAGE } from "@/lib/blacklist"
import { normalizePhone, phoneDigits, phoneMatchCandidates } from "@/lib/phone"

// ============================================================================
// Inscription mobile par MOT DE PASSE (sans OTP). Crée un compte client Supabase
// Auth (e-mail réel ou synthétique dérivé du numéro) + profil, puis connecte.
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let body: { nom?: string; telephone?: string; email?: string; password?: string; commune?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  // Sans plafond, on peut créer des comptes en masse depuis un script.
  if (limiteAtteinte(`register:ip:${ipDe(req)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: TROP_DE_TENTATIVES }, { status: 429 })
  }

  const nom = (body.nom ?? "").trim()
  const telephone = normalizePhone(body.telephone ?? "")
  const realEmail = (body.email ?? "").trim().toLowerCase() || null
  const password = body.password ?? ""
  const commune = (body.commune ?? "").trim() || null

  if (!nom) return NextResponse.json({ error: "Votre nom est requis." }, { status: 400 })
  if (phoneDigits(telephone).length < 8) return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: "Le mot de passe doit comporter au moins 6 caractères." }, { status: 400 })
  if (realEmail && !realEmail.includes("@")) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 })

  if ((await checkBlacklist({ telephone, email: realEmail })).blocked) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 })
  }

  const admin = createAdminClient()

  // Compte déjà rattaché à ce numéro ? → on invite à se connecter.
  const { data: existRows } = await admin.from("profiles").select("id").in("telephone", phoneMatchCandidates(telephone)).limit(1)
  if ((existRows ?? []).length > 0) {
    return NextResponse.json({ error: "Un compte existe déjà avec ce numéro. Connectez-vous." }, { status: 409 })
  }

  const email = realEmail ?? synthEmail(telephone)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nom, telephone, ...(commune ? { commune } : {}) },
  })
  if (createErr || !created?.user) {
    if (createErr?.message?.toLowerCase().includes("already")) {
      return NextResponse.json({ error: "Cet e-mail ou ce numéro est déjà utilisé. Connectez-vous." }, { status: 409 })
    }
    console.error("INAYA-MREG-001", createErr?.message)
    return NextResponse.json({ error: "Impossible de créer le compte. Réessayez." }, { status: 500 })
  }

  const uid = created.user.id
  const patch: Record<string, unknown> = { nom, telephone, role: "client" }
  if (commune) patch.commune = commune
  let { error: upErr } = await admin.from("profiles").update(patch as never).eq("id", uid)
  if (upErr?.code === "42703") {
    const r2 = await admin.from("profiles").update({ nom, telephone, role: "client" } as never).eq("id", uid)
    upErr = r2.error
  }
  if (upErr) console.error("INAYA-MREG-002", upErr.message)

  const token = signMobileToken(uid)
  return NextResponse.json({
    ok: true, token,
    user: { id: uid, nom, telephone, commune, role: "client", verifie: false },
  })
}
