import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import {
  agentDepuisEntete, peutEcrire, refus, verrou,
  CANAUX, STATUTS_CLIENT,
} from "@/lib/agent-mobile"

// ============================================================================
// LA FICHE CLIENT — tout ce qu'on sait de lui en un seul appel.
//
// Un agent debout devant un client n'a pas le temps de faire quatre écrans :
// la fiche, ses requêtes, les biens qu'on lui a proposés et l'historique
// partent ensemble. C'est trois requêtes de plus côté serveur et trois
// allers-retours de moins sur une connexion de terrain.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const acces = await verrou(agent, id, "lecture")
  if ("echec" in acces) return acces.echec
  const client = acces.client

  const admin = createAdminClient()
  const [propRes, reqRes, evtRes] = await Promise.all([
    admin.from("client_propositions")
      .select("id,property_id,search_request_id,statut,visite_le,motif_refus,satisfaction,commentaire,created_at,updated_at")
      .eq("agent_client_id", id).order("created_at", { ascending: false }).limit(100),
    admin.from("search_requests")
      .select("id,reference,statut,type_offre,categories,budget_min,budget_max,zones,communes,nb_pieces_min,meuble,description_libre,created_at,expire_at")
      .eq("agent_client_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("client_events")
      .select("id,proposition_id,auteur_id,type,statut_avant,statut_apres,contenu,created_at")
      .eq("agent_client_id", id).order("created_at", { ascending: false }).limit(80),
  ])

  const propositions = (propRes.data ?? []) as Record<string, unknown>[]

  // Les biens proposés, en une requête. Aucune colonne de contact : un agent
  // ne voit jamais le numéro du propriétaire — c'est ce qui protège la
  // commission d'Inaya.
  const idsBiens = [...new Set(propositions.map(p => String(p.property_id)))]
  const biens = new Map<string, Record<string, unknown>>()
  if (idsBiens.length) {
    const { data } = await admin.from("properties")
      .select("id,reference,titre,type_offre,categorie,statut,prix,quartier,ville,nb_pieces,surface")
      .in("id", idsBiens)
    for (const b of (data ?? []) as Record<string, unknown>[]) biens.set(String(b.id), b)
  }

  // Les auteurs des événements : un collègue a pu noter un appel.
  const idsAuteurs = [...new Set(
    ((evtRes.data ?? []) as { auteur_id: string | null }[])
      .map(e => e.auteur_id).filter((x): x is string => !!x))]
  const auteurs = new Map<string, string>()
  if (idsAuteurs.length) {
    const { data } = await admin.from("profiles").select("id,nom,prenom").in("id", idsAuteurs)
    for (const a of (data ?? []) as { id: string; nom: string | null; prenom: string | null }[]) {
      auteurs.set(a.id, `${a.prenom ?? ""} ${a.nom ?? ""}`.trim() || "Inaya")
    }
  }

  let proprietaire = agent.nom ?? "Moi"
  if (client.agent_id !== agent.userId) {
    const { data } = await admin.from("profiles")
      .select("nom,prenom").eq("id", client.agent_id).maybeSingle()
    const p = data as { nom: string | null; prenom: string | null } | null
    proprietaire = `${p?.prenom ?? ""} ${p?.nom ?? ""}`.trim() || "Collègue"
  }

  return NextResponse.json({
    client,
    modifiable: peutEcrire(agent, client.agent_id),
    agent_nom: proprietaire,
    propositions: propositions.map(p => ({ ...p, bien: biens.get(String(p.property_id)) ?? null })),
    requetes: reqRes.data ?? [],
    evenements: ((evtRes.data ?? []) as Record<string, unknown>[]).map(e => ({
      ...e, auteur_nom: e.auteur_id ? (auteurs.get(String(e.auteur_id)) ?? "Inaya") : "Inaya",
    })),
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const acces = await verrou(agent, id, "ecriture")
  if ("echec" in acces) return acces.echec
  const avant = acces.client

  let corps: Record<string, unknown>
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  for (const champ of ["nom", "telephone", "telephone_2", "email", "quartier", "ville", "profession", "source_detail", "notes", "cloture_motif"]) {
    if (typeof corps[champ] === "string") {
      const v = (corps[champ] as string).trim()
      patch[champ] = v ? v.slice(0, 2000) : (champ === "nom" || champ === "telephone" ? undefined : null)
      if (patch[champ] === undefined) delete patch[champ]
    }
  }
  if (typeof corps.canal === "string" && CANAUX.includes(corps.canal as never)) patch.canal = corps.canal
  if (typeof corps.statut === "string" && STATUTS_CLIENT.includes(corps.statut as never)) patch.statut = corps.statut
  if ("relance_le" in corps) patch.relance_le = corps.relance_le ? String(corps.relance_le).slice(0, 10) : null
  if ("satisfaction" in corps) {
    const n = Number(corps.satisfaction)
    patch.satisfaction = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
  }

  // Un dossier clos porte sa date : elle permet de mesurer la durée d'un
  // accompagnement, ce qu'un simple statut ne dira jamais.
  if (patch.statut && patch.statut !== avant.statut) {
    patch.cloture_le = (patch.statut === "conclu" || patch.statut === "perdu")
      ? new Date().toISOString() : null
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: "rien_a_modifier" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("agent_clients").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (patch.statut && patch.statut !== avant.statut) {
    await admin.from("client_events").insert({
      agent_client_id: id, auteur_id: agent.userId, type: "changement_statut",
      statut_avant: avant.statut, statut_apres: String(patch.statut),
      contenu: typeof patch.cloture_motif === "string" ? patch.cloture_motif : null,
    } as never)
  }

  return NextResponse.json({ ok: true, champs: Object.keys(patch) })
}
