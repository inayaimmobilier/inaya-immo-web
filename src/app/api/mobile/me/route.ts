import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

// ============================================================================
// Auth mobile — profil de l'utilisateur connecté (Bearer). GET = lecture,
// PATCH = mise à jour du nom / de la commune.
// ============================================================================
export const runtime = "nodejs"

async function loadProfile(userId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from("profiles")
    .select("id, nom, telephone, commune, role, verifie")
    .eq("id", userId).maybeSingle()
  return data as { id: string; nom: string | null; telephone: string | null; commune: string | null; role: string | null; verifie: boolean | null } | null
}

export async function GET(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })
  const prof = await loadProfile(userId)
  if (!prof) return NextResponse.json({ error: "compte_introuvable" }, { status: 404 })
  return NextResponse.json({ user: prof })
}

export async function PATCH(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  let body: { nom?: string; commune?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body.nom === "string" && body.nom.trim()) patch.nom = body.nom.trim().slice(0, 120)
  if (typeof body.commune === "string" && body.commune.trim()) patch.commune = body.commune.trim().slice(0, 120)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })

  const admin = createAdminClient()
  let { error } = await admin.from("profiles").update(patch as never).eq("id", userId)
  if (error?.code === "42703" && patch.commune) {
    const r2 = await admin.from("profiles").update({ nom: patch.nom } as never).eq("id", userId)
    error = r2.error
  }
  if (error) { console.error("INAYA-MAUTH-ME", error.message); return NextResponse.json({ error: "Échec de la mise à jour." }, { status: 500 }) }

  const prof = await loadProfile(userId)
  return NextResponse.json({ user: prof })
}
