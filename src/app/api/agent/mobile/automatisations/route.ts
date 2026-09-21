import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"
import { DESCRIPTIONS, TYPES, automatisationsActives, type TypeAutomation } from "@/lib/automations-agent"

// ============================================================================
// RÉGLER SES ENVOIS AUTOMATIQUES.
//
// Les cinq règles sont TOUJOURS renvoyées, même celles que l'agent n'a jamais
// touchées : il doit voir ce que l'application sait faire, et constater que
// tout est éteint. Une fonction invisible tant qu'on ne l'a pas activée ne
// s'active jamais ; une fonction visible mais éteinte se comprend.
//
// Le journal des derniers envois part avec : c'est la seule façon, pour
// l'agent, de savoir ce qui est réellement parti en son nom.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const admin = createAdminClient()
  const [{ data: reglesBrutes }, { data: modeles }, { data: journal }, global] = await Promise.all([
    admin.from("agent_automations")
      .select("id,type,actif,modele_id,delai_jours,plafond_jour")
      .eq("agent_id", agent.userId),
    admin.from("message_templates")
      .select("id,code,titre,categorie,corps")
      .or(`agent_id.is.null,agent_id.eq.${agent.userId}`)
      .eq("actif", true),
    admin.from("automation_sends")
      .select("type,cle,statut,message,erreur,created_at,agent_client_id")
      .eq("agent_id", agent.userId)
      .order("created_at", { ascending: false }).limit(30),
    automatisationsActives(),
  ])

  type Reglee = {
    id: string; type: string; actif: boolean; modele_id: string | null
    delai_jours: number; plafond_jour: number
  }
  const existantes = new Map(((reglesBrutes ?? []) as Reglee[]).map(r => [r.type, r]))
  const listeModeles = (modeles ?? []) as { id: string; code: string; titre: string; categorie: string; corps: string }[]

  const regles = TYPES.map(t => {
    const r = existantes.get(t)
    const d = DESCRIPTIONS[t]
    // Le modèle suggéré : celui que la migration a livré pour ce motif.
    const suggere = listeModeles.find(m => m.code === d.codeModele)
    return {
      type: t,
      titre: d.titre,
      detail: d.detail,
      actif: r?.actif ?? false,
      modele_id: r?.modele_id ?? suggere?.id ?? null,
      modele_titre: listeModeles.find(m => m.id === (r?.modele_id ?? suggere?.id))?.titre ?? null,
      delai_jours: r?.delai_jours ?? (t === "apres_visite" ? 3 : 30),
      plafond_jour: r?.plafond_jour ?? 20,
      // Ces deux règles n'ont pas de délai : l'écran ne doit pas le demander.
      avec_delai: t === "sans_nouvelles" || t === "apres_visite",
    }
  })

  // Le nom des clients concernés par le journal, pour qu'il soit lisible.
  const idsClients = [...new Set(((journal ?? []) as { agent_client_id: string }[]).map(j => j.agent_client_id))]
  const noms = new Map<string, string>()
  if (idsClients.length) {
    const { data } = await admin.from("agent_clients").select("id,nom").in("id", idsClients)
    for (const c of (data ?? []) as { id: string; nom: string }[]) noms.set(c.id, c.nom)
  }

  return NextResponse.json({
    // Si l'administration n'a pas allumé l'interrupteur général, aucune règle
    // n'enverra quoi que ce soit. L'agent doit le savoir AVANT d'en armer une.
    actives_globalement: global,
    regles,
    modeles: listeModeles.map(m => ({ id: m.id, titre: m.titre, categorie: m.categorie })),
    journal: ((journal ?? []) as Record<string, unknown>[]).map(j => ({
      ...j,
      client_nom: noms.get(String(j.agent_client_id)) ?? "Client supprimé",
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  let c: {
    type?: string; actif?: boolean; modele_id?: string | null
    delai_jours?: number; plafond_jour?: number
  }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  if (!TYPES.includes(c.type as TypeAutomation)) {
    return NextResponse.json({ error: "regle_inconnue" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Armer une règle sans texte à envoyer n'a pas de sens : on refuse plutôt
  // que de créer une règle qui ne fera rien et dont personne ne saura pourquoi.
  if (c.actif === true) {
    let modeleId = c.modele_id ?? null
    if (!modeleId) {
      const { data } = await admin.from("agent_automations")
        .select("modele_id").eq("agent_id", agent.userId).eq("type", c.type!).maybeSingle()
      modeleId = (data as { modele_id: string | null } | null)?.modele_id ?? null
    }
    if (!modeleId) {
      return NextResponse.json({
        error: "modele_manquant",
        message: "Choisissez le message à envoyer avant d'activer cette règle.",
      }, { status: 400 })
    }
    c.modele_id = modeleId
  }

  const ligne: Record<string, unknown> = { agent_id: agent.userId, type: c.type }
  if (typeof c.actif === "boolean") ligne.actif = c.actif
  if (c.modele_id !== undefined) ligne.modele_id = c.modele_id
  if (typeof c.delai_jours === "number") {
    ligne.delai_jours = Math.min(365, Math.max(1, Math.round(c.delai_jours)))
  }
  if (typeof c.plafond_jour === "number") {
    ligne.plafond_jour = Math.min(200, Math.max(1, Math.round(c.plafond_jour)))
  }

  const { error } = await admin.from("agent_automations")
    .upsert(ligne as never, { onConflict: "agent_id,type" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    actif: c.actif ?? null,
    // On redit l'état général à chaque enregistrement : un agent qui arme une
    // règle alors que tout est en pause doit comprendre pourquoi rien ne part.
    actives_globalement: await automatisationsActives(),
  })
}
