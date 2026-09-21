import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, estAdministration, refus } from "@/lib/agent-mobile"
import { CATEGORIES, VARIABLES } from "@/lib/messages-agent"

// ============================================================================
// LES MODÈLES DE MESSAGES.
//
// Deux familles mélangées dans une seule liste, volontairement : ceux de
// l'agence (parole officielle d'Inaya, modifiables par l'administration) et
// ceux que l'agent s'est écrits. À l'usage il cherche « un texte pour
// remercier », pas « un modèle d'agence » — le classement se fait par
// catégorie, pas par propriétaire.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLONNES = "id,agent_id,code,titre,categorie,canal,corps,actif,ordre,systeme,updated_at"

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const admin = createAdminClient()
  const { data, error } = await admin.from("message_templates")
    .select(COLONNES)
    .or(`agent_id.is.null,agent_id.eq.${agent.userId}`)
    .eq("actif", true)
    .order("categorie").order("ordre")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const modeles = ((data ?? []) as Record<string, unknown>[]).map(m => ({
    ...m,
    a_moi: m.agent_id === agent.userId,
    // Ce que l'application grise : un agent voit les modèles de l'agence mais
    // ne les retouche pas, sinon la parole officielle partirait dans tous les sens.
    modifiable: m.agent_id === agent.userId || estAdministration(agent.role),
  }))

  return NextResponse.json({ modeles, categories: CATEGORIES, variables: VARIABLES })
}

export async function POST(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  let c: Record<string, unknown>
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const titre = String(c.titre ?? "").trim()
  const corps = String(c.corps ?? "").trim()
  if (!titre) return NextResponse.json({ error: "titre_obligatoire" }, { status: 400 })
  if (!corps) return NextResponse.json({ error: "corps_obligatoire" }, { status: 400 })

  const categorie = CATEGORIES.includes(String(c.categorie) as never) ? String(c.categorie) : "autre"
  const canal = ["sms", "whatsapp", "les_deux"].includes(String(c.canal)) ? String(c.canal) : "les_deux"

  // Un modèle créé depuis l'application appartient à son auteur. Pour écrire
  // un modèle d'AGENCE, l'administration passe `agence: true`.
  const pourAgence = c.agence === true && estAdministration(agent.role)

  const admin = createAdminClient()
  const { data, error } = await admin.from("message_templates").insert({
    agent_id: pourAgence ? null : agent.userId,
    code: codeDepuis(titre),
    titre: titre.slice(0, 120),
    categorie,
    canal,
    corps: corps.slice(0, 1200),
    created_by: agent.userId,
  } as never).select("id").single()

  if (error) {
    // Deux modèles du même nom chez la même personne : on le dit dans ses mots.
    if (error.code === "23505") return NextResponse.json({ error: "titre_deja_pris" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 })
}

/** « Merci après une visite » → « merci_apres_une_visite ». */
function codeDepuis(titre: string): string {
  return titre.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || `modele_${Date.now()}`
}
