import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { verifyOtp } from "@/lib/otp"
import { signMobileToken } from "@/lib/mobile-session"
import { resolveAccount } from "@/lib/mobile-auth"

// ============================================================================
// Mot de passe oublié — étape 2 : vérifie le code OTP puis fixe le nouveau mot
// de passe et reconnecte (jeton de session).
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let body: { identifier?: string; code?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const identifier = (body.identifier ?? "").trim()
  const code = (body.code ?? "").replace(/\D/g, "")
  const password = body.password ?? ""
  if (!identifier) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 })
  if (code.length !== 6) return NextResponse.json({ error: "Le code doit comporter 6 chiffres." }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: "Le mot de passe doit comporter au moins 6 caractères." }, { status: 400 })

  const acc = await resolveAccount(identifier)
  if (!acc) return NextResponse.json({ error: "Aucun compte trouvé pour cet identifiant." }, { status: 404 })

  const r = await verifyOtp(acc.userId, code)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(acc.userId, { password })
  if (error) { console.error("INAYA-MRESET-001", error.message); return NextResponse.json({ error: "Impossible de changer le mot de passe. Réessayez." }, { status: 500 }) }

  const { data: prof } = await admin.from("profiles").select("id, nom, telephone, commune, role, verifie").eq("id", acc.userId).maybeSingle()
  const p = prof as { id: string; nom: string | null; telephone: string | null; commune: string | null; role: string | null; verifie: boolean | null } | null
  const token = signMobileToken(acc.userId)
  return NextResponse.json({
    ok: true, token,
    user: { id: acc.userId, nom: p?.nom ?? acc.nom, telephone: p?.telephone ?? acc.telephone, commune: p?.commune ?? null, role: p?.role ?? acc.role, verifie: p?.verifie ?? null },
  })
}
