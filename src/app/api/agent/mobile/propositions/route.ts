import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"

// ============================================================================
// TOUS LES BIENS PROPOSÉS, PAR ÉTAT.
//
// Le tableau de bord annonçait « 4 biens en attente de réponse » sans que rien
// ne permette de savoir LESQUELS. Un chiffre sur lequel on ne peut pas cliquer
// oblige à ouvrir les fiches une par une pour le retrouver.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EN_COURS = ["proposee", "vue", "visite_planifiee", "visite_effectuee", "interesse"]

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const etat = req.nextUrl.searchParams.get("etat") ?? "en_cours"
  const admin = createAdminClient()

  let requete = admin.from("client_propositions")
    .select("id,agent_client_id,property_id,statut,visite_le,motif_refus,satisfaction,updated_at")
    .eq("agent_id", agent.userId)

  if (etat === "conclues") requete = requete.eq("statut", "conclue")
  else if (etat === "refusees") requete = requete.in("statut", ["refusee", "abandonnee"])
  else requete = requete.in("statut", EN_COURS)

  const { data, error } = await requete.order("updated_at", { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const props = (data ?? []) as {
    id: string; agent_client_id: string; property_id: string
    statut: string; visite_le: string | null; motif_refus: string | null
    satisfaction: number | null; updated_at: string
  }[]
  if (!props.length) return NextResponse.json({ propositions: [], total: 0 })

  // Le client et le bien en deux requêtes, pas deux par ligne.
  const [{ data: cl }, { data: bi }] = await Promise.all([
    admin.from("agent_clients").select("id,nom,telephone")
      .in("id", [...new Set(props.map(p => p.agent_client_id))]),
    admin.from("properties").select("id,reference,titre,prix,type_offre,quartier,ville")
      .in("id", [...new Set(props.map(p => p.property_id))]),
  ])

  const clients = new Map(((cl ?? []) as { id: string }[]).map(c => [c.id, c]))
  const biens = new Map(((bi ?? []) as { id: string }[]).map(b => [b.id, b]))

  return NextResponse.json({
    propositions: props.map(p => ({
      ...p,
      client: clients.get(p.agent_client_id) ?? null,
      bien: biens.get(p.property_id) ?? null,
    })),
    total: props.length,
  })
}
