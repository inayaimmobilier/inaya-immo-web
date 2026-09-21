import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus, verrou } from "@/lib/agent-mobile"

// ============================================================================
// CE QUE LE CLIENT CHERCHE.
//
// Volontairement écrit dans `search_requests`, la table des recherches
// sauvegardées — PAS dans une table parallèle. Conséquence directe : la requête
// entre dans le moteur de rapprochement existant, et l'agent est prévenu
// automatiquement dès qu'un bien correspondant est publié (`created_by` est
// alerté en plus du client, cf. migration 042).
//
// Une table « besoins du client » séparée aurait été plus simple à écrire et
// parfaitement inerte : personne n'aurait jamais été alerté de rien.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const acces = await verrou(agent, id, "ecriture")
  if ("echec" in acces) return acces.echec
  const client = acces.client

  let c: Record<string, unknown>
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const description = String(c.description_libre ?? "").trim()
  const typeOffre = c.type_offre === "location" || c.type_offre === "vente" ? c.type_offre : null
  if (!typeOffre && !description) {
    return NextResponse.json({ error: "requete_vide" }, { status: 400 })
  }

  const ligne: Record<string, unknown> = {
    agent_client_id: id,
    // Le client reste joignable par ce qu'on sait de lui : c'est la fiche qui
    // porte le contact, pas la requête.
    contact_nom: client.nom,
    contact_telephone: client.telephone,
    user_id: client.profile_id,
    canal: "interne",
    created_by: agent.userId,
    statut: "active",
    type_offre: typeOffre,
    categories: tableau(c.categories),
    zones: tableau(c.zones),
    communes: tableau(c.communes),
    budget_min: nombre(c.budget_min),
    budget_max: nombre(c.budget_max),
    surface_min: nombre(c.surface_min),
    nb_pieces_min: entier(c.nb_pieces_min),
    meuble: typeof c.meuble === "boolean" ? c.meuble : null,
    description_libre: description || null,
  }
  // `commune` (singulier) est encore lue par du code existant : on la tient à
  // jour avec la première valeur, comme le fait la migration 055.
  const communes = ligne.communes as string[] | null
  if (communes?.length) ligne.commune = communes[0]

  const admin = createAdminClient()
  const { data, error } = await admin.from("search_requests")
    .insert(ligne as never).select("id,reference").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = data as { id: string; reference: number | null }
  await admin.from("client_events").insert({
    agent_client_id: id, auteur_id: agent.userId, type: "note",
    contenu: `Requête ${r.reference ? `R${r.reference}` : "enregistrée"} : ${resume(ligne)}`,
  } as never)

  return NextResponse.json({ ok: true, id: r.id, reference: r.reference }, { status: 201 })
}

function tableau(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const l = v.map(x => String(x).trim()).filter(Boolean).slice(0, 20)
  return l.length ? l : null
}
function nombre(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
function entier(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** Une ligne lisible dans l'historique, sans avoir à rouvrir la requête. */
function resume(l: Record<string, unknown>): string {
  const bouts: string[] = []
  if (l.type_offre) bouts.push(String(l.type_offre))
  const cats = l.categories as string[] | null
  if (cats?.length) bouts.push(cats.join("/"))
  if (l.nb_pieces_min) bouts.push(`${l.nb_pieces_min} pièces min`)
  const zones = (l.zones as string[] | null) ?? (l.communes as string[] | null)
  if (zones?.length) bouts.push(zones.join(", "))
  if (l.budget_max) bouts.push(`≤ ${Number(l.budget_max).toLocaleString("fr-FR")} FCFA`)
  return bouts.join(" · ") || String(l.description_libre ?? "").slice(0, 120)
}
