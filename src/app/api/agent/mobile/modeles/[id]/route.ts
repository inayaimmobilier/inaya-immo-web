import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, estAdministration, refus } from "@/lib/agent-mobile"
import { CATEGORIES } from "@/lib/messages-agent"

// ============================================================================
// MODIFIER OU SUPPRIMER UN MODÈLE.
//
// Les modèles livrés d'origine (`systeme`) se modifient mais ne se suppriment
// pas : un agent pressé doit toujours trouver de quoi écrire.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Modele {
  id: string; agent_id: string | null; systeme: boolean; titre: string
}

async function charger(id: string) {
  const { data } = await createAdminClient()
    .from("message_templates").select("id,agent_id,systeme,titre").eq("id", id).maybeSingle()
  return data as Modele | null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const modele = await charger(id)
  if (!modele) return NextResponse.json({ error: "modele_introuvable" }, { status: 404 })

  // Un modèle de l'agence est la parole officielle d'Inaya : l'administration
  // seule le retouche. Un agent modifie les siens.
  const autorise = estAdministration(agent.role) || modele.agent_id === agent.userId
  if (!autorise) return NextResponse.json({ error: "modele_de_l_agence" }, { status: 403 })

  let c: Record<string, unknown>
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof c.titre === "string" && c.titre.trim()) patch.titre = c.titre.trim().slice(0, 120)
  if (typeof c.corps === "string" && c.corps.trim()) patch.corps = c.corps.trim().slice(0, 1200)
  if (typeof c.categorie === "string" && CATEGORIES.includes(c.categorie as never)) patch.categorie = c.categorie
  if (typeof c.canal === "string" && ["sms", "whatsapp", "les_deux"].includes(c.canal)) patch.canal = c.canal
  if (typeof c.actif === "boolean") patch.actif = c.actif

  if (!Object.keys(patch).length) return NextResponse.json({ error: "rien_a_modifier" }, { status: 400 })

  const { error } = await createAdminClient()
    .from("message_templates").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, champs: Object.keys(patch) })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const modele = await charger(id)
  if (!modele) return NextResponse.json({ error: "modele_introuvable" }, { status: 404 })
  if (modele.systeme) {
    return NextResponse.json({ error: "modele_livre_non_supprimable" }, { status: 403 })
  }
  if (!estAdministration(agent.role) && modele.agent_id !== agent.userId) {
    return NextResponse.json({ error: "modele_de_l_agence" }, { status: 403 })
  }

  const { error } = await createAdminClient().from("message_templates").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
