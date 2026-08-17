import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  return null
}

// GET → liste des groupes détectés pour ce compte
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkAdmin()
  if (authErr) return authErr
  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("whatsapp_groups")
    .select("id,nom,nb_participants,last_seen_at,commune_prioritaire")
    .eq("account_id", id)
    .order("nom")

  if (error) {
    // Colonne absente = migration 058 pas encore appliquée. On sert la liste
    // sans la priorité plutôt que de casser l'écran des groupes surveillés,
    // qui, lui, marchait déjà.
    const repli = await admin
      .from("whatsapp_groups")
      .select("id,nom,nb_participants,last_seen_at")
      .eq("account_id", id)
      .order("nom")
    if (repli.error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(repli.data ?? [])
  }
  return NextResponse.json(data ?? [])
}

/**
 * PATCH → commune prioritaire d'UN groupe.
 *
 * Sert d'arbitre quand un nom de quartier existe dans plusieurs communes :
 * « plateau » écrit dans un groupe de Bouaké désigne Commerce, pas le Centre
 * de Yamoussoukro. Ne force jamais une commune écrite dans l'annonce.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkAdmin()
  if (authErr) return authErr
  const { id: accountId } = await params

  const body = (await req.json()) as { groupId?: string; commune?: string | null }
  if (!body.groupId) return NextResponse.json({ error: "groupId requis" }, { status: 400 })

  const commune = (body.commune ?? "").trim() || null
  const admin = createAdminClient()

  // Vérifie que la commune existe vraiment : une faute de frappe ici
  // fausserait silencieusement toutes les annonces du groupe.
  if (commune) {
    const { data: ville } = await admin.from("villes").select("nom").eq("nom", commune).maybeSingle()
    if (!ville) return NextResponse.json({ error: `Commune inconnue : ${commune}` }, { status: 400 })
  }

  const { error } = await admin
    .from("whatsapp_groups")
    .update({ commune_prioritaire: commune } as never)
    .eq("id", body.groupId)
    .eq("account_id", accountId)

  if (error) {
    const manque = /commune_prioritaire/.test(error.message)
    return NextResponse.json(
      { error: manque ? "Appliquez d'abord la migration 058 dans Supabase." : error.message },
      { status: manque ? 409 : 500 },
    )
  }
  return NextResponse.json({ ok: true })
}

// POST → met à jour groupes_surveilles pour ce compte
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkAdmin()
  if (authErr) return authErr
  const { id } = await params

  const body = (await req.json()) as { groupes: { id: string; nom: string }[] }
  if (!Array.isArray(body.groupes)) return NextResponse.json({ error: "groupes requis" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from("whatsapp_accounts")
    .update({ groupes_surveilles: body.groupes } as never)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
