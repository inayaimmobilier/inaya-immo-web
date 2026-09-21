import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus, verrou, TYPES_EVENEMENT } from "@/lib/agent-mobile"

// ============================================================================
// NOTER CE QU'ON VIENT DE FAIRE.
//
// « Appelé, il rappelle demain », « visite reportée » : c'est ce qui évite de
// faire raconter deux fois son histoire au client, et ce qui permet à un
// collègue de reprendre le dossier.
//
// L'écriture est ouverte à TOUT le staff, même sur la fiche d'un collègue :
// celui qui prend l'appel doit pouvoir le consigner. Ce qu'il ne peut pas,
// c'est modifier la fiche ou faire avancer une proposition qui n'est pas la
// sienne — les deux autres routes s'en chargent.
//
// Rien ne se modifie ni ne s'efface ici : un historique réécrit ne prouve rien.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const acces = await verrou(agent, id, "lecture")
  if ("echec" in acces) return acces.echec

  let corps: { type?: string; contenu?: string; relance_le?: string | null }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const type = TYPES_EVENEMENT.includes(corps.type as never) ? corps.type! : "note"
  const contenu = (corps.contenu ?? "").trim().slice(0, 2000)
  if (!contenu) return NextResponse.json({ error: "contenu_vide" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("client_events").insert({
    agent_client_id: id, auteur_id: agent.userId, type, contenu,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Noter un appel et fixer le prochain rappel est le MÊME geste sur le
  // terrain : les séparer en deux écrans, c'est garantir que le second sera
  // sauté. Seul le propriétaire de la fiche peut déplacer sa date.
  let relance: string | null | undefined
  if ("relance_le" in corps && acces.client.agent_id === agent.userId) {
    relance = corps.relance_le ? String(corps.relance_le).slice(0, 10) : null
    await admin.from("agent_clients").update({ relance_le: relance } as never).eq("id", id)
  }

  return NextResponse.json({ ok: true, relance_le: relance ?? undefined }, { status: 201 })
}
