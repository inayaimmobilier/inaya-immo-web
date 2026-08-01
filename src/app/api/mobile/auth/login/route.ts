import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { signMobileToken } from "@/lib/mobile-session"
import { resolveAccount, verifyPassword, isRealEmail } from "@/lib/mobile-auth"
import { checkBlacklist, BLOCKED_MESSAGE } from "@/lib/blacklist"
import { cleIdentifiant, ipDe, limiteAtteinte, TROP_DE_TENTATIVES } from "@/lib/rate-limit"

// ============================================================================
// Connexion mobile par MOT DE PASSE. Identifiant = téléphone (indicatif+numéro)
// OU e-mail. Renvoie un jeton de session (Bearer).
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let body: { identifier?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const identifier = (body.identifier ?? "").trim()
  const password = body.password ?? ""
  if (!identifier || !password) return NextResponse.json({ error: "Identifiant et mot de passe requis." }, { status: 400 })

  // Deux compteurs : par COMPTE visé (empêche d'essayer mille mots de passe sur
  // un numéro donné, même en changeant d'adresse) et par ADRESSE (empêche de
  // balayer beaucoup de comptes depuis un même point).
  const fenetre = 10 * 60_000
  if (limiteAtteinte(`login:id:${cleIdentifiant(identifier)}`, 8, fenetre) ||
      limiteAtteinte(`login:ip:${ipDe(req)}`, 30, fenetre)) {
    return NextResponse.json({ error: TROP_DE_TENTATIVES }, { status: 429 })
  }

  const acc = await resolveAccount(identifier)
  if (!acc) return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 })

  // Liste noire (numéro + e-mail réel).
  if ((await checkBlacklist({ telephone: acc.telephone, email: isRealEmail(acc.email) ? acc.email : null })).blocked) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 })
  }
  if (acc.status === "suspendu" || acc.status === "banni") {
    return NextResponse.json({ error: "Ce compte est momentanément indisponible." }, { status: 403 })
  }

  if (!acc.email || !(await verifyPassword(acc.email, password))) {
    return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: prof } = await admin.from("profiles").select("id, nom, telephone, commune, role, verifie").eq("id", acc.userId).maybeSingle()
  const p = prof as { id: string; nom: string | null; telephone: string | null; commune: string | null; role: string | null; verifie: boolean | null } | null
  const token = signMobileToken(acc.userId)
  return NextResponse.json({
    ok: true, token,
    user: { id: acc.userId, nom: p?.nom ?? acc.nom, telephone: p?.telephone ?? acc.telephone, commune: p?.commune ?? null, role: p?.role ?? acc.role, verifie: p?.verifie ?? null },
  })
}
