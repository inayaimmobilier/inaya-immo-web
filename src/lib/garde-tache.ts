import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/server"
import { verifierJetonTache } from "@/lib/stop-token"
import { limiteAtteinte } from "@/lib/rate-limit"

// ============================================================================
// GARDE DES LIENS DE TÂCHE (/t, /tc, /tr).
//
// Ces pages agissent sans compte : le lien reçu par WhatsApp fait office
// d'autorisation. Encore faut-il qu'il en soit une. La référence seule ne l'est
// pas — quatre caractères hexadécimaux dérivés de l'UUID du lead, soit 65 536
// possibilités et une dérivation devinable (voir `jetonTache`).
//
// D'où deux verrous, et non un :
//
//   1. La SIGNATURE, qui rend la référence infabriquable. C'est le vrai
//      correctif ; tout le reste n'est qu'un filet.
//   2. La LIMITATION DE DÉBIT par adresse, qui couvre les liens envoyés AVANT
//      ce correctif — ils ne portent pas de signature et doivent continuer de
//      fonctionner, sans quoi on coupe des agents de tâches en cours pour
//      fermer une faille : le remède serait la panne qu'on redoute.
//
// Un jeton signé passe sans compter les essais : c'est l'agent légitime qui
// clique, parfois plusieurs fois, et rien ne justifie de le brider.
// ============================================================================

/** Nombre d'essais NON SIGNÉS tolérés par adresse et par heure. */
const ESSAIS_NON_SIGNES = 8
const FENETRE_MS = 60 * 60_000

export type Tache =
  | { ok: true; ref: string; leadId: string; agentId: string | null }
  | { ok: false; error: string }

async function adresse(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-real-ip")?.trim()
    || "inconnue"
}

/**
 * Vérifie le jeton puis résout la tâche.
 *
 * Le message d'erreur est le MÊME quand la tâche n'existe pas et quand la
 * limite est atteinte sur un jeton non signé : distinguer les deux dirait à
 * l'énumérateur quelles références existent, ce qui est exactement ce qu'il
 * cherche.
 */
export async function resoudreTache(raw: string): Promise<Tache> {
  const { ref, signe } = verifierJetonTache(raw)
  if (ref.length !== 4) return { ok: false, error: "Référence invalide." }

  if (!signe) {
    const ip = await adresse()
    if (limiteAtteinte(`tache:${ip}`, ESSAIS_NON_SIGNES, FENETRE_MS)) {
      console.warn("INAYA-TACHE-LIMITE", ip, ref)
      return { ok: false, error: "Tâche introuvable ou expirée." }
    }
  }

  const admin = createAdminClient()
  const { data } = await admin.from("lead_followups")
    .select("lead_id, agent_id").eq("ref", ref)
    .order("envoye_le", { ascending: false }).limit(1).maybeSingle()
  const f = data as { lead_id: string; agent_id: string | null } | null
  if (!f) return { ok: false, error: "Tâche introuvable ou expirée." }

  return { ok: true, ref, leadId: f.lead_id, agentId: f.agent_id }
}
