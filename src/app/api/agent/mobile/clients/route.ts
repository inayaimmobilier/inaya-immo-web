import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import {
  agentDepuisEntete, refus, numeroNormalise,
  CANAUX, STATUTS_CLIENT,
} from "@/lib/agent-mobile"

// ============================================================================
// LE CARNET : liste et création.
//
// La liste s'ouvre par défaut sur MES clients — c'est la question du matin.
// `vue=tous` montre ceux des collègues, en lecture seule, pour ne pas
// démarcher deux fois la même personne.
//
// Page courte (25) : on la consulte au téléphone, souvent en 3G. La leçon du
// quota Supabase dépassé le 09/09/2026 vaut aussi ici.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 25

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const vue = p.get("vue") === "tous" ? "tous" : "mes"
  const statut = p.get("statut") ?? ""
  const q = (p.get("q") ?? "").trim()
  const relances = p.get("relances") === "1"
  const page = Math.max(1, Number(p.get("page") ?? 1))

  const admin = createAdminClient()
  let req_ = admin.from("agent_clients_resume")
    .select("*", { count: "exact" })

  if (vue === "mes") req_ = req_.eq("agent_id", agent.userId)
  if (statut) req_ = req_.eq("statut", statut)

  // « À rappeler » : tout ce qui est dû aujourd'hui ou en retard. Un rappel
  // oublié ne doit pas sortir de la liste parce que sa date est passée — c'est
  // justement là qu'il compte le plus.
  if (relances) {
    req_ = req_.not("relance_le", "is", null)
      .lte("relance_le", new Date().toISOString().slice(0, 10))
  }

  if (q) {
    const chiffres = q.replace(/\D/g, "")
    const motif = `%${q.replace(/[%,()]/g, " ").trim()}%`
    req_ = chiffres.length >= 4
      ? req_.or(`nom.ilike.${motif},telephone_norm.ilike.%${chiffres.slice(-10)}%`)
      : req_.ilike("nom", motif)
  }

  const debut = (page - 1) * PAR_PAGE
  const { data, count, error } = await req_
    .order("relance_le", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(debut, debut + PAR_PAGE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lignes = (data ?? []) as Record<string, unknown>[]

  // Le nom de l'agent propriétaire, pour les fiches des collègues. Une seule
  // requête pour toute la page.
  const autresIds = [...new Set(lignes.map(l => String(l.agent_id)).filter(id => id !== agent.userId))]
  const noms = new Map<string, string>()
  if (autresIds.length) {
    const { data: prof } = await admin.from("profiles")
      .select("id,nom,prenom").in("id", autresIds)
    for (const x of (prof ?? []) as { id: string; nom: string | null; prenom: string | null }[]) {
      noms.set(x.id, `${x.prenom ?? ""} ${x.nom ?? ""}`.trim() || "Collègue")
    }
  }

  return NextResponse.json({
    clients: lignes.map(l => ({
      ...l,
      a_moi: l.agent_id === agent.userId,
      agent_nom: l.agent_id === agent.userId ? (agent.nom ?? "Moi") : (noms.get(String(l.agent_id)) ?? "Collègue"),
    })),
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAR_PAGE)),
  })
}

export async function POST(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  let corps: Record<string, unknown>
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const nom = String(corps.nom ?? "").trim()
  const telephone = String(corps.telephone ?? "").trim()
  if (!nom) return NextResponse.json({ error: "nom_obligatoire" }, { status: 400 })
  if (numeroNormalise(telephone).length < 8) {
    return NextResponse.json({ error: "telephone_invalide" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Doublon : on répond par la fiche existante plutôt que par une violation de
  // contrainte. L'agent veut ouvrir ce client, pas comprendre un code Postgres.
  const { data: dejaLa } = await admin.from("agent_clients")
    .select("id,nom").eq("agent_id", agent.userId)
    .eq("telephone_norm", numeroNormalise(telephone)).maybeSingle()
  if (dejaLa) {
    const d = dejaLa as { id: string; nom: string }
    return NextResponse.json({ error: "deja_dans_le_carnet", client_id: d.id, nom: d.nom }, { status: 409 })
  }

  const canal = CANAUX.includes(String(corps.canal) as never) ? String(corps.canal) : "terrain"
  const statut = STATUTS_CLIENT.includes(String(corps.statut) as never) ? String(corps.statut) : "actif"

  const ligne = {
    agent_id: agent.userId,
    nom,
    telephone,
    telephone_2: texte(corps.telephone_2),
    email: texte(corps.email),
    quartier: texte(corps.quartier),
    ville: texte(corps.ville) ?? "Bouaké",
    profession: texte(corps.profession),
    canal,
    source_detail: texte(corps.source_detail),
    statut,
    relance_le: texte(corps.relance_le),
    notes: texte(corps.notes),
  }

  const { data, error } = await admin.from("agent_clients")
    .insert(ligne as never).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const id = (data as { id: string }).id
  await admin.from("client_events").insert({
    agent_client_id: id, auteur_id: agent.userId, type: "note",
    contenu: `Client enregistré (${canal}).`,
  } as never)

  return NextResponse.json({ ok: true, id }, { status: 201 })
}

/** Chaîne nettoyée, ou `null` — une case vide ne doit pas devenir `""` en base. */
function texte(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s.slice(0, 2000) : null
}
