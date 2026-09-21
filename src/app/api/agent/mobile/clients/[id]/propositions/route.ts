import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus, verrou } from "@/lib/agent-mobile"

// ============================================================================
// PROPOSER UN BIEN À UN CLIENT.
//
// Le geste central du métier. Le bien est désigné par son NUMÉRO d'annonce
// (« 820 ») ou par son identifiant : sur le terrain, c'est le numéro qu'on a
// sous les yeux, lu dans WhatsApp ou sur le catalogue.
//
// Proposer deux fois le même bien au même client n'ouvre pas une deuxième
// ligne : c'est une relance, elle s'écrit dans l'historique. Sans cela, la
// fiche se remplirait de doublons et « combien de biens lui a-t-on montré ? »
// n'aurait plus de réponse.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Bien { id: string; titre: string; reference: number | null; statut: string }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const acces = await verrou(agent, id, "ecriture")
  if ("echec" in acces) return acces.echec

  let c: { property_id?: string; reference?: number | string; search_request_id?: string; commentaire?: string }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const admin = createAdminClient()

  // Retrouver le bien : par identifiant, sinon par numéro d'annonce.
  let bien: Bien | null = null
  if (c.property_id) {
    const { data } = await admin.from("properties")
      .select("id,titre,reference,statut").eq("id", c.property_id).maybeSingle()
    bien = data as Bien | null
  } else if (c.reference != null && String(c.reference).trim() !== "") {
    const ref = Number(String(c.reference).replace(/\D/g, ""))
    if (Number.isFinite(ref)) {
      const { data } = await admin.from("properties")
        .select("id,titre,reference,statut").eq("reference", ref).maybeSingle()
      bien = data as Bien | null
    }
  }
  if (!bien) return NextResponse.json({ error: "annonce_introuvable" }, { status: 404 })

  const { data: existante } = await admin.from("client_propositions")
    .select("id,statut").eq("agent_client_id", id).eq("property_id", bien.id).maybeSingle()

  if (existante) {
    const e = existante as { id: string; statut: string }
    await admin.from("client_events").insert({
      agent_client_id: id, proposition_id: e.id, auteur_id: agent.userId, type: "relance",
      contenu: `Bien n°${bien.reference ?? "—"} reproposé — « ${bien.titre} ».`,
    } as never)
    return NextResponse.json({ ok: true, id: e.id, deja_proposee: true, statut: e.statut })
  }

  const { data, error } = await admin.from("client_propositions").insert({
    agent_client_id: id,
    property_id: bien.id,
    search_request_id: c.search_request_id ?? null,
    // Celui qui propose, pas le propriétaire de la fiche : une fiche peut
    // changer de main, la paternité d'une proposition ne doit pas bouger.
    agent_id: agent.userId,
    statut: "proposee",
    commentaire: (c.commentaire ?? "").trim().slice(0, 1000) || null,
  } as never).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const propId = (data as { id: string }).id
  await admin.from("client_events").insert({
    agent_client_id: id, proposition_id: propId, auteur_id: agent.userId,
    type: "proposition", statut_apres: "proposee",
    contenu: `Bien n°${bien.reference ?? "—"} proposé — « ${bien.titre} ».`,
  } as never)

  // Une annonce qui n'est plus publiée peut tout de même être proposée — un
  // agent sait parfois qu'elle se relibère. On le SIGNALE, sans l'interdire.
  return NextResponse.json({
    ok: true, id: propId,
    avertissement: bien.statut === "publie" ? null : `Cette annonce est « ${bien.statut} ».`,
  }, { status: 201 })
}
