import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

// ============================================================================
// Recherches sauvegardées (alertes) de l'utilisateur. Quand un bien correspondant
// est publié, le matching existant (notifySearcher) envoie une notification push.
//   GET  : mes recherches.  POST : enregistrer.  DELETE ?id= : supprimer.
// ============================================================================
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })
  const admin = createAdminClient()
  const { data } = await admin.from("search_requests")
    .select("id, type_offre, categories, budget_max, zones, nb_pieces_min, description_libre, statut, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(30)
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  let body: { type_offre?: string; categories?: string[]; commune?: string; quartiers?: string[]; prix_max?: number; chambres_min?: number; description_libre?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const admin = createAdminClient()
  const { data: prof } = await admin.from("profiles").select("nom, telephone").eq("id", userId).maybeSingle()
  const p = prof as { nom: string | null; telephone: string | null } | null

  const zones = [body.commune, ...(body.quartiers ?? [])].filter(Boolean) as string[]
  const row: Record<string, unknown> = {
    user_id: userId,
    contact_nom: p?.nom ?? null,
    contact_telephone: p?.telephone ?? null,
    canal: "app",
    type_offre: body.type_offre || null,
    categories: body.categories?.length ? body.categories : null,
    budget_max: body.prix_max ?? null,
    zones: zones.length ? zones : null,
    nb_pieces_min: body.chambres_min ?? null,
    description_libre: body.description_libre?.trim() || null,
    statut: "active",
  }

  let { data, error } = await admin.from("search_requests").insert(row as never).select("id").maybeSingle()
  if (error?.code === "42703") {
    // Colonnes récentes absentes → insertion minimale.
    const r2 = await admin.from("search_requests").insert({
      user_id: userId, contact_telephone: p?.telephone ?? null, canal: "app",
      type_offre: row.type_offre, budget_max: row.budget_max, zones: row.zones, statut: "active",
    } as never).select("id").maybeSingle()
    data = r2.data; error = r2.error
  }
  if (error) { console.error("INAYA-MSEARCH", error.message); return NextResponse.json({ error: "Impossible d'enregistrer la recherche." }, { status: 500 }) }
  return NextResponse.json({ ok: true, id: (data as { id: string } | null)?.id ?? null })
}

export async function DELETE(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 })
  const admin = createAdminClient()
  await admin.from("search_requests").delete().eq("id", id).eq("user_id", userId).then(() => {}, () => {})
  return NextResponse.json({ ok: true })
}
