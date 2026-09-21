import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, peutEcrire, refus, ETAPES_PROPOSITION } from "@/lib/agent-mobile"

// ============================================================================
// FAIRE AVANCER UNE PROPOSITION.
//
// « Les différentes étapes de l'évolution » : chaque changement écrit une
// ligne dans l'historique, avec l'état d'avant. Le statut seul dirait où on en
// est ; l'historique dit comment on y est arrivé, et c'est cela qu'on relit
// trois mois plus tard devant un client mécontent.
//
// La satisfaction se saisit à l'arrivée — refus ou conclusion. Demandée plus
// tôt, elle ne mesurerait rien.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FINALES = new Set(["refusee", "conclue", "abandonnee"])

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data } = await admin.from("client_propositions")
    .select("id,agent_client_id,agent_id,statut,property_id").eq("id", id).maybeSingle()
  const prop = data as {
    id: string; agent_client_id: string; agent_id: string; statut: string; property_id: string
  } | null
  if (!prop) return NextResponse.json({ error: "proposition_introuvable" }, { status: 404 })
  if (!peutEcrire(agent, prop.agent_id)) {
    return NextResponse.json({ error: "proposition_d_un_collegue" }, { status: 403 })
  }

  let c: Record<string, unknown>
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  let nouveauStatut: string | null = null

  if (typeof c.statut === "string") {
    if (!ETAPES_PROPOSITION.includes(c.statut as never)) {
      return NextResponse.json({ error: "etape_inconnue" }, { status: 400 })
    }
    if (c.statut !== prop.statut) { patch.statut = c.statut; nouveauStatut = c.statut }
  }
  if ("visite_le" in c) patch.visite_le = c.visite_le ? new Date(String(c.visite_le)).toISOString() : null
  if (typeof c.motif_refus === "string") patch.motif_refus = c.motif_refus.trim().slice(0, 1000) || null
  if (typeof c.commentaire === "string") patch.commentaire = c.commentaire.trim().slice(0, 1000) || null
  if ("satisfaction" in c) {
    const n = Number(c.satisfaction)
    patch.satisfaction = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: "rien_a_modifier" }, { status: 400 })

  // Une visite planifiée sans date n'aide personne : on le dit au lieu de
  // laisser passer une étape vide qui devra être corrigée plus tard.
  if (nouveauStatut === "visite_planifiee" && !patch.visite_le && !("visite_le" in c)) {
    return NextResponse.json({ error: "date_de_visite_manquante" }, { status: 400 })
  }

  const { error } = await admin.from("client_propositions").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (nouveauStatut) {
    const morceaux: string[] = []
    if (patch.motif_refus) morceaux.push(String(patch.motif_refus))
    if (patch.commentaire) morceaux.push(String(patch.commentaire))
    if (patch.satisfaction) morceaux.push(`Satisfaction : ${patch.satisfaction}/5`)
    if (patch.visite_le) {
      morceaux.push(`Visite le ${new Date(String(patch.visite_le)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`)
    }
    await admin.from("client_events").insert({
      agent_client_id: prop.agent_client_id, proposition_id: id, auteur_id: agent.userId,
      type: "changement_statut", statut_avant: prop.statut, statut_apres: nouveauStatut,
      contenu: morceaux.join(" — ") || null,
    } as never)
  }

  // Une affaire conclue reste à transformer en transaction : c'est
  // l'administration qui saisit le montant et déclenche la commission. On le
  // rappelle à l'agent plutôt que de lui laisser croire que tout est fait.
  const rappel = nouveauStatut === "conclue"
    ? "Signalez la conclusion à l'administration pour l'enregistrement de la transaction et de votre commission."
    : null

  return NextResponse.json({ ok: true, statut: nouveauStatut ?? prop.statut, finale: nouveauStatut ? FINALES.has(nouveauStatut) : false, rappel })
}
