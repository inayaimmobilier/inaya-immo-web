// ============================================================================
// LES ENVOIS AUTOMATIQUES.
//
// Une tournée par jour. Pour chaque règle ARMÉE par un agent, on cherche les
// clients concernés, on écrit le message, on l'envoie par la passerelle SMS,
// et on le consigne.
//
// ── L'ORDRE DES OPÉRATIONS N'EST PAS ARBITRAIRE ────────────────────────────
//
// On RÉSERVE d'abord la place dans le journal, on envoie ensuite. La
// contrainte unique de `automation_sends` refuse alors le doublon avant qu'un
// seul message ne parte. L'ordre inverse — envoyer puis journaliser — laisse
// une fenêtre où deux tournées simultanées envoient deux fois, et le client
// reçoit deux fois le même vœu d'anniversaire.
//
// Conséquence assumée : un envoi qui échoue n'est PAS réessayé le lendemain.
// Pour un anniversaire, réessayer le lendemain n'a aucun sens. Pour une
// relance, mieux vaut un message manqué qu'une boucle qui envoie tous les
// matins jusqu'à ce que le client se fâche.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { rendre } from "@/lib/messages-agent"
import { enfilerSms } from "@/lib/sms-gateway"

export const TYPES = [
  "anniversaire", "sans_nouvelles", "rappel_visite", "apres_visite", "apres_conclusion",
] as const
export type TypeAutomation = (typeof TYPES)[number]

export const DESCRIPTIONS: Record<TypeAutomation, { titre: string; detail: string; codeModele: string }> = {
  anniversaire: {
    titre: "Souhaiter les anniversaires",
    detail: "Le jour dit, aux clients dont vous connaissez la date de naissance.",
    codeModele: "voeux_anniversaire",
  },
  sans_nouvelles: {
    titre: "Relancer les clients sans nouvelles",
    detail: "Quand rien n'a été noté sur leur fiche depuis un certain temps.",
    codeModele: "relance_silence",
  },
  rappel_visite: {
    titre: "Rappeler une visite la veille",
    detail: "Aux clients dont une visite est prévue le lendemain.",
    codeModele: "visite_confirmation",
  },
  apres_visite: {
    titre: "Prendre des nouvelles après une visite",
    detail: "Quelques jours après une visite effectuée, pour savoir ce qu'ils en ont pensé.",
    codeModele: "remerciement_visite",
  },
  apres_conclusion: {
    titre: "Remercier après une affaire conclue",
    detail: "Le lendemain d'une affaire conclue.",
    codeModele: "remerciement_confiance",
  },
}

interface Regle {
  id: string
  agent_id: string
  type: TypeAutomation
  modele_id: string | null
  delai_jours: number
  plafond_jour: number
}

interface Cible {
  client: { id: string; nom: string; telephone: string }
  cle: string
  bien?: { id: string; titre: string; reference: number | null } | null
}

export interface Bilan {
  actif: boolean
  regles: number
  envoyes: number
  echecs: number
  ignores: number
  plafonds: string[]
  detail: { type: string; agent: string; envoyes: number; echecs: number }[]
}

const jour = (d: Date) => d.toISOString().slice(0, 10)

/**
 * L'interrupteur général.
 *
 * Posé à « pause » par la migration : la fonction existe, mais n'enverra rien
 * tant que l'administration ne l'aura pas allumée sciemment.
 */
export async function automatisationsActives(): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "agent_automations").maybeSingle()
    return (data as { value: unknown } | null)?.value === "actif"
  } catch {
    // Dans le doute, on n'envoie pas. Le silence se rattrape, pas l'inverse.
    return false
  }
}

export async function tournee(): Promise<Bilan> {
  const bilan: Bilan = {
    actif: false, regles: 0, envoyes: 0, echecs: 0, ignores: 0, plafonds: [], detail: [],
  }

  if (!(await automatisationsActives())) return bilan
  bilan.actif = true

  const admin = createAdminClient()
  const { data } = await admin.from("agent_automations")
    .select("id,agent_id,type,modele_id,delai_jours,plafond_jour")
    .eq("actif", true)
  const regles = (data ?? []) as Regle[]
  bilan.regles = regles.length
  if (!regles.length) return bilan

  // Les agents concernés : leur nom entre dans le message.
  const idsAgents = [...new Set(regles.map(r => r.agent_id))]
  const { data: profs } = await admin.from("profiles")
    .select("id,nom,prenom,telephone").in("id", idsAgents)
  const agents = new Map(
    ((profs ?? []) as { id: string; nom: string | null; prenom: string | null; telephone: string | null }[])
      .map(p => [p.id, {
        nom: `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || "Votre agent",
        telephone: p.telephone,
      }]),
  )

  for (const regle of regles) {
    const agent = agents.get(regle.agent_id) ?? { nom: "Votre agent", telephone: null }

    if (!regle.modele_id) {
      // Une règle armée sans texte est une règle inerte : on la compte comme
      // ignorée plutôt que d'envoyer un message vide.
      bilan.ignores++
      continue
    }

    const { data: m } = await admin.from("message_templates")
      .select("corps").eq("id", regle.modele_id).maybeSingle()
    const corps = (m as { corps: string } | null)?.corps
    if (!corps) { bilan.ignores++; continue }

    // Ce qui est déjà parti aujourd'hui pour cet agent, toutes règles
    // confondues : le plafond protège le client, pas la règle.
    const { count: dejaAujourdhui } = await admin.from("automation_sends")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", regle.agent_id)
      .gte("created_at", `${jour(new Date())}T00:00:00Z`)

    let budget = regle.plafond_jour - (dejaAujourdhui ?? 0)
    if (budget <= 0) {
      bilan.plafonds.push(`${agent.nom} — plafond du jour atteint`)
      continue
    }

    const cibles = await chercher(admin, regle)
    let envoyes = 0
    let echecs = 0

    for (const cible of cibles) {
      if (budget <= 0) {
        bilan.plafonds.push(`${agent.nom} · ${regle.type} — plafond atteint, ${cibles.length - envoyes - echecs} client(s) non traités`)
        break
      }

      // ── On réserve AVANT d'envoyer ──────────────────────────────────────
      //
      // Et on réserve en « échec ». Si le processus s'arrête entre la
      // réservation et l'envoi, la ligne reste sur « pas parti » — ce qui est
      // vrai, ou au pire prudent. L'inverse écrirait « envoyé » pour un
      // message que personne n'a reçu, et le journal cesserait d'être une
      // preuve.
      const { error: conflit } = await admin.from("automation_sends").insert({
        automation_id: regle.id,
        agent_id: regle.agent_id,
        agent_client_id: cible.client.id,
        type: regle.type,
        cle: cible.cle,
        statut: "echec",
        erreur: "envoi en cours",
      } as never)

      if (conflit) {
        // 23505 = déjà envoyé pour ce motif. Ce n'est pas une erreur, c'est
        // la barrière qui fait son travail.
        if (conflit.code !== "23505") bilan.echecs++
        else bilan.ignores++
        continue
      }

      const texte = rendre(corps, {
        client: { nom: cible.client.nom },
        agent: { nom: agent.nom, telephone: agent.telephone },
        bien: cible.bien ?? null,
      })

      const parti = await enfilerSms({
        telephone: cible.client.telephone, message: texte, type: "notification",
      })

      await admin.from("automation_sends")
        .update({
          message: texte,
          statut: parti ? "envoye" : "echec",
          erreur: parti ? null : "passerelle indisponible ou numéro hors Côte d'Ivoire",
        } as never)
        .eq("agent_client_id", cible.client.id)
        .eq("type", regle.type)
        .eq("cle", cible.cle)

      if (parti) {
        envoyes++
        budget--
        // Le message apparaît sur la fiche, comme n'importe quel autre : un
        // envoi automatique qui n'apparaîtrait pas dans l'historique ferait
        // croire à l'agent qu'il n'a pas donné signe de vie.
        await admin.from("client_events").insert({
          agent_client_id: cible.client.id,
          auteur_id: regle.agent_id,
          type: "sms",
          contenu: `Envoi automatique (${DESCRIPTIONS[regle.type].titre}).\n${texte}`,
        } as never)
      } else {
        echecs++
      }
    }

    bilan.envoyes += envoyes
    bilan.echecs += echecs
    if (envoyes || echecs) {
      bilan.detail.push({ type: regle.type, agent: agent.nom, envoyes, echecs })
    }
  }

  return bilan
}

// ── Qui est concerné ────────────────────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>

async function chercher(admin: Admin, regle: Regle): Promise<Cible[]> {
  switch (regle.type) {
    case "anniversaire": return anniversaires(admin, regle)
    case "sans_nouvelles": return sansNouvelles(admin, regle)
    case "rappel_visite": return visites(admin, regle, "rappel")
    case "apres_visite": return visites(admin, regle, "apres")
    case "apres_conclusion": return conclusions(admin, regle)
  }
}

const CLIENT_COLS = "id,nom,telephone,statut,date_naissance,created_at"

async function anniversaires(admin: Admin, regle: Regle): Promise<Cible[]> {
  const aujourdhui = new Date()
  const mmjj = `${String(aujourdhui.getUTCMonth() + 1).padStart(2, "0")}-${String(aujourdhui.getUTCDate()).padStart(2, "0")}`

  const { data } = await admin.from("agent_clients")
    .select(CLIENT_COLS)
    .eq("agent_id", regle.agent_id)
    .not("date_naissance", "is", null)
    .neq("statut", "perdu")
  const clients = (data ?? []) as { id: string; nom: string; telephone: string; date_naissance: string }[]

  // Le filtre mois-jour se fait ici : PostgREST ne sait pas comparer deux
  // parties de date, et un agent n'a pas dix mille clients.
  return clients
    .filter(c => c.date_naissance.slice(5) === mmjj)
    .map(c => ({
      client: { id: c.id, nom: c.nom, telephone: c.telephone },
      cle: String(aujourdhui.getUTCFullYear()),
    }))
}

/**
 * Clients dont la fiche est muette depuis `delai_jours`.
 *
 * La clé porte la DATE DE LA DERNIÈRE ACTIVITÉ, pas celle du jour. Deux
 * conséquences voulues : un seul message par période de silence, et le message
 * lui-même — qui crée un événement — remet le compteur à zéro. Une clé fondée
 * sur la date du jour relancerait le même client tous les matins.
 */
async function sansNouvelles(admin: Admin, regle: Regle): Promise<Cible[]> {
  const limite = new Date(Date.now() - regle.delai_jours * 864e5)

  const { data } = await admin.from("agent_clients")
    .select(CLIENT_COLS)
    .eq("agent_id", regle.agent_id)
    .eq("statut", "actif")
    .lte("updated_at", limite.toISOString())
    .limit(500)
  const clients = (data ?? []) as { id: string; nom: string; telephone: string; created_at: string }[]
  if (!clients.length) return []

  // Ceux qui ont bougé récemment sortent de la liste.
  const { data: recents } = await admin.from("client_events")
    .select("agent_client_id,created_at")
    .in("agent_client_id", clients.map(c => c.id))
    .gte("created_at", limite.toISOString())
  const bouges = new Set(((recents ?? []) as { agent_client_id: string }[]).map(e => e.agent_client_id))

  const candidats = clients.filter(c => !bouges.has(c.id))
  if (!candidats.length) return []

  // La date du dernier signe de vie, pour la clé d'unicité.
  const { data: derniers } = await admin.from("client_events")
    .select("agent_client_id,created_at")
    .in("agent_client_id", candidats.map(c => c.id))
    .order("created_at", { ascending: false })
    .limit(2000)
  const dernier = new Map<string, string>()
  for (const e of (derniers ?? []) as { agent_client_id: string; created_at: string }[]) {
    if (!dernier.has(e.agent_client_id)) dernier.set(e.agent_client_id, e.created_at)
  }

  return candidats.map(c => ({
    client: { id: c.id, nom: c.nom, telephone: c.telephone },
    cle: (dernier.get(c.id) ?? c.created_at).slice(0, 10),
  }))
}

async function visites(admin: Admin, regle: Regle, quand: "rappel" | "apres"): Promise<Cible[]> {
  const statut = quand === "rappel" ? "visite_planifiee" : "visite_effectuee"

  let requete = admin.from("client_propositions")
    .select("id,agent_client_id,property_id,visite_le,updated_at")
    .eq("agent_id", regle.agent_id)
    .eq("statut", statut)

  if (quand === "rappel") {
    // Demain, du matin au soir.
    const demain = new Date(Date.now() + 864e5)
    requete = requete
      .gte("visite_le", `${jour(demain)}T00:00:00Z`)
      .lte("visite_le", `${jour(demain)}T23:59:59Z`)
  } else {
    // Le jour où le délai tombe, pas après : sinon on écrirait chaque jour à
    // tous ceux dont la visite est plus ancienne que le délai.
    const cible = new Date(Date.now() - regle.delai_jours * 864e5)
    requete = requete
      .gte("updated_at", `${jour(cible)}T00:00:00Z`)
      .lte("updated_at", `${jour(cible)}T23:59:59Z`)
  }

  const { data } = await requete.limit(200)
  return enrichir(admin, (data ?? []) as PropositionBrute[], regle.type)
}

async function conclusions(admin: Admin, regle: Regle): Promise<Cible[]> {
  const hier = new Date(Date.now() - 864e5)
  const { data } = await admin.from("client_propositions")
    .select("id,agent_client_id,property_id,visite_le,updated_at")
    .eq("agent_id", regle.agent_id)
    .eq("statut", "conclue")
    .gte("updated_at", `${jour(hier)}T00:00:00Z`)
    .lte("updated_at", `${jour(hier)}T23:59:59Z`)
    .limit(200)
  return enrichir(admin, (data ?? []) as PropositionBrute[], regle.type)
}

interface PropositionBrute {
  id: string; agent_client_id: string; property_id: string
  visite_le: string | null; updated_at: string
}

/** Complète les propositions avec leur client et leur annonce, en deux requêtes. */
async function enrichir(admin: Admin, props: PropositionBrute[], type: string): Promise<Cible[]> {
  if (!props.length) return []

  const [{ data: cl }, { data: bi }] = await Promise.all([
    admin.from("agent_clients").select("id,nom,telephone,statut")
      .in("id", props.map(p => p.agent_client_id)),
    admin.from("properties").select("id,titre,reference")
      .in("id", props.map(p => p.property_id)),
  ])

  const clients = new Map(
    ((cl ?? []) as { id: string; nom: string; telephone: string; statut: string }[])
      .filter(c => c.statut !== "perdu")
      .map(c => [c.id, c]),
  )
  const biens = new Map(
    ((bi ?? []) as { id: string; titre: string; reference: number | null }[]).map(b => [b.id, b]),
  )

  const cibles: Cible[] = []
  for (const p of props) {
    const c = clients.get(p.agent_client_id)
    if (!c) continue
    cibles.push({
      client: { id: c.id, nom: c.nom, telephone: c.telephone },
      // L'identifiant de la proposition : une visite ne se rappelle qu'une
      // fois, même si la tournée repasse.
      cle: `${type}:${p.id}`,
      bien: biens.get(p.property_id) ?? null,
    })
  }
  return cibles
}
