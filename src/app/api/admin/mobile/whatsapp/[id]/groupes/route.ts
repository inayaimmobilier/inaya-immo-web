import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// GROUPES D'UN COMPTE : lesquels il voit, lesquels il ÉCOUTE.
//
// Un compte peut être membre de deux cents groupes et n'en écouter que vingt.
// Écouter se règle ici ; être membre ne se règle PAS ici — rejoindre un groupe
// WhatsApp est une action humaine, faite depuis le téléphone. L'écran le dit,
// pour qu'on ne croie pas avoir gagné un groupe en cochant une case.
//
// Chaque groupe porte aussi sa commune prioritaire : elle tranche les noms de
// quartiers ambigus (« Zone Industrielle » existe à Bouaké ET à Yamoussoukro).
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const { id } = await ctx.params
  const admin = createAdminClient()

  const [{ data: compte }, { data: groupes }] = await Promise.all([
    admin.from("whatsapp_accounts").select("nom,groupes_surveilles").eq("id", id).maybeSingle(),
    admin.from("whatsapp_groups")
      .select("id,nom,nb_participants,commune_prioritaire,last_seen_at")
      .eq("account_id", id).order("nom"),
  ])
  if (!compte) return NextResponse.json({ error: "introuvable" }, { status: 404 })

  const surveilles = Array.isArray((compte as { groupes_surveilles?: unknown }).groupes_surveilles)
    ? ((compte as { groupes_surveilles: { id: string }[] }).groupes_surveilles).map(g => g.id)
    : []
  const ensemble = new Set(surveilles)

  // Le rendement décide quels groupes méritent d'être écoutés : on compte les
  // annonces produites sur 30 jours plutôt que les messages reçus, un groupe
  // bavard qui ne publie rien d'exploitable ne valant pas une place.
  const depuis = new Date(Date.now() - 30 * 86400_000).toISOString()
  const rendement = new Map<string, number>()
  for (let de = 0; ; de += 1000) {
    const { data } = await admin.from("whatsapp_messages")
      .select("group_id").gte("recu_le", depuis).not("property_id", "is", null)
      .eq("account_id", id).order("id").range(de, de + 999)
    const lot = (data ?? []) as { group_id: string | null }[]
    for (const m of lot) if (m.group_id) rendement.set(m.group_id, (rendement.get(m.group_id) ?? 0) + 1)
    if (lot.length < 1000) break
  }

  const lignes = ((groupes ?? []) as {
    id: string; nom: string | null; nb_participants: number | null
    commune_prioritaire: string | null; last_seen_at: string | null
  }[]).map(g => ({
    id: g.id, nom: g.nom ?? "(sans nom)",
    participants: g.nb_participants ?? 0,
    commune: g.commune_prioritaire,
    surveille: ensemble.has(g.id),
    annonces30j: rendement.get(g.id) ?? 0,
    vu_le: g.last_seen_at,
  })).sort((a, b) => b.annonces30j - a.annonces30j || a.nom.localeCompare(b.nom))

  return NextResponse.json({
    compte: (compte as { nom: string }).nom,
    groupes: lignes,
    droits: { gerer: peut(staff.role, "parametres") },
  })
}

/** Active ou désactive l'écoute d'un groupe pour ce compte. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "parametres")) return refus("acces_refuse")

  const { id } = await ctx.params
  let corps: { groupId?: string; surveille?: boolean; commune?: string | null }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (!corps.groupId) return NextResponse.json({ error: "groupId_requis" }, { status: 400 })

  const admin = createAdminClient()

  // Commune prioritaire du groupe : réglage indépendant de l'écoute.
  if ("commune" in corps) {
    await admin.from("whatsapp_groups")
      .update({ commune_prioritaire: corps.commune?.trim() || null } as never)
      .eq("id", corps.groupId).eq("account_id", id)
  }

  if (typeof corps.surveille === "boolean") {
    const { data } = await admin.from("whatsapp_accounts")
      .select("groupes_surveilles").eq("id", id).maybeSingle()
    const brut = (data as { groupes_surveilles?: unknown } | null)?.groupes_surveilles
    const actuels = Array.isArray(brut) ? (brut as { id: string; nom?: string }[]) : []

    let suivants = actuels.filter(g => g.id !== corps.groupId)
    if (corps.surveille) {
      const { data: g } = await admin.from("whatsapp_groups")
        .select("nom").eq("id", corps.groupId).eq("account_id", id).maybeSingle()
      suivants = [...suivants, { id: corps.groupId, nom: (g as { nom: string | null } | null)?.nom ?? "" }]
    }

    const { error } = await admin.from("whatsapp_accounts")
      .update({ groupes_surveilles: suivants } as never).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, surveilles: suivants.length })
  }

  return NextResponse.json({ ok: true })
}
