import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { verifyOtp } from "@/lib/otp"
import { signMobileToken } from "@/lib/mobile-session"
import { normalizePhone, phoneDigits, phoneMatchCandidates } from "@/lib/phone"

// ============================================================================
// Auth mobile — étape 2 : vérification du code + émission de la session.
//   On retrouve le profil par téléphone, on vérifie l'OTP (même moteur que le
//   web), puis on renvoie un jeton de session (Bearer) que l'app stocke.
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let body: { telephone?: string; code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const telephone = normalizePhone(body.telephone ?? "")
  const code = (body.code ?? "").replace(/\D/g, "")
  if (phoneDigits(telephone).length < 8) return NextResponse.json({ error: "Numéro invalide." }, { status: 400 })
  if (code.length !== 6) return NextResponse.json({ error: "Le code doit comporter 6 chiffres." }, { status: 400 })

  const admin = createAdminClient()
  const { data: rows } = await admin.from("profiles")
    .select("id, nom, telephone, role, statut, verifie")
    .in("telephone", phoneMatchCandidates(telephone)).limit(1)
  const prof = ((rows ?? []) as { id: string; nom: string | null; telephone: string | null; role: string | null; statut: string | null; verifie: boolean | null }[])[0] ?? null

  if (!prof) return NextResponse.json({ error: "Aucun compte pour ce numéro. Demandez un code." }, { status: 404 })
  if (prof.statut === "suspendu" || prof.statut === "banni") {
    return NextResponse.json({ error: "Ce compte est momentanément indisponible." }, { status: 403 })
  }

  const r = await verifyOtp(prof.id, code)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 })

  const token = signMobileToken(prof.id)
  return NextResponse.json({
    ok: true,
    token,
    user: {
      id: prof.id,
      nom: prof.nom,
      telephone: prof.telephone,
      role: prof.role,
      verifie: true,
    },
  })
}
