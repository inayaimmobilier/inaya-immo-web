import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"

// ============================================================================
// L'ÉCRAN DU MATIN.
//
// Une seule question : qui dois-je rappeler aujourd'hui ? Le reste — les
// compteurs — sert à savoir où on en est, pas à décider quoi faire.
//
// Les retards sont comptés séparément des rappels du jour. Un rappel oublié
// hier ne disparaît pas parce que la date est passée : c'est précisément là
// qu'on perd un client.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EN_COURS = ["proposee", "vue", "visite_planifiee", "visite_effectuee", "interesse"]

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const admin = createAdminClient()
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const [clientsRes, propsRes, rappelsRes, visitesRes] = await Promise.all([
    admin.from("agent_clients").select("statut").eq("agent_id", agent.userId),
    admin.from("client_propositions").select("statut").eq("agent_id", agent.userId),
    admin.from("agent_clients")
      .select("id,nom,telephone,relance_le,statut")
      .eq("agent_id", agent.userId).not("relance_le", "is", null)
      .lte("relance_le", aujourdhui).order("relance_le").limit(50),
    // Les visites à venir : la seule chose qui ait une heure dans la journée
    // d'un agent, donc la seule qu'on ne peut pas rattraper le lendemain.
    admin.from("client_propositions")
      .select("id,agent_client_id,property_id,visite_le")
      .eq("agent_id", agent.userId).eq("statut", "visite_planifiee")
      .not("visite_le", "is", null).gte("visite_le", new Date(Date.now() - 864e5).toISOString())
      .order("visite_le").limit(20),
  ])

  const clients = (clientsRes.data ?? []) as { statut: string }[]
  const props = (propsRes.data ?? []) as { statut: string }[]
  const rappels = (rappelsRes.data ?? []) as { id: string; nom: string; telephone: string; relance_le: string; statut: string }[]
  const visites = (visitesRes.data ?? []) as { id: string; agent_client_id: string; property_id: string; visite_le: string }[]

  // Nom du client et titre du bien pour les visites : deux requêtes, pas
  // deux par ligne.
  let visitesDetaillees: Record<string, unknown>[] = []
  if (visites.length) {
    const [{ data: cli }, { data: bie }] = await Promise.all([
      admin.from("agent_clients").select("id,nom,telephone").in("id", visites.map(v => v.agent_client_id)),
      admin.from("properties").select("id,reference,titre,quartier").in("id", visites.map(v => v.property_id)),
    ])
    const parClient = new Map(((cli ?? []) as { id: string; nom: string; telephone: string }[]).map(c => [c.id, c]))
    const parBien = new Map(((bie ?? []) as { id: string; reference: number | null; titre: string; quartier: string | null }[]).map(b => [b.id, b]))
    visitesDetaillees = visites.map(v => ({
      ...v,
      client: parClient.get(v.agent_client_id) ?? null,
      bien: parBien.get(v.property_id) ?? null,
    }))
  }

  const compte = (liste: { statut: string }[], s: string) => liste.filter(x => x.statut === s).length

  return NextResponse.json({
    clients: {
      total: clients.length,
      actifs: compte(clients, "actif"),
      conclus: compte(clients, "conclu"),
      perdus: compte(clients, "perdu"),
    },
    propositions: {
      total: props.length,
      enCours: props.filter(p => EN_COURS.includes(p.statut)).length,
      conclues: compte(props, "conclue"),
      refusees: compte(props, "refusee"),
    },
    rappels: {
      aujourdhui: rappels.filter(r => r.relance_le === aujourdhui),
      enRetard: rappels.filter(r => r.relance_le < aujourdhui),
    },
    visites: visitesDetaillees,
  })
}
