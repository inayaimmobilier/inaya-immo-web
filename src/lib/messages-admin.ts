// ============================================================================
// ACTIONS SUR LES MESSAGES WHATSAPP NON INGÉRÉS.
//
// Écrites UNE fois, appelées par le back-office (session par cookie) et par
// l'application d'administration (jeton porteur). Deux implémentations
// finiraient par diverger, et c'est le genre d'écart qui se découvre le jour
// où l'on relance cinquante messages depuis le téléphone sans le même effet
// que depuis l'ordinateur.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"

export type ActionMessage = "relancer" | "supprimer"

export interface ResultatAction {
  ok: boolean
  traites: number
  ignores: number
  erreur?: string
}

/** Au-delà, on refuse : une erreur de sélection ne doit pas vider la file. */
const MAX_PAR_LOT = 200

/**
 * Remet des messages dans la file d'ingestion.
 *
 * Un message qui a épuisé ses tentatives n'est plus jamais repris : il reste
 * là, invisible, et l'annonce qu'il portait n'existera jamais. Remettre le
 * compteur à zéro et lever le verrou suffit — le service le reprend au cycle
 * suivant, avec les correctifs déployés entre-temps.
 *
 * Les messages DÉJÀ traités sont ignorés, pas relancés : les retraiter créerait
 * des doublons d'annonces.
 */
export async function relancerMessages(ids: string[]): Promise<ResultatAction> {
  if (!ids.length) return { ok: false, traites: 0, ignores: 0, erreur: "Aucun message sélectionné." }
  if (ids.length > MAX_PAR_LOT) {
    return { ok: false, traites: 0, ignores: 0, erreur: `Maximum ${MAX_PAR_LOT} messages à la fois.` }
  }

  const admin = createAdminClient()
  const { data: existants } = await admin.from("whatsapp_messages")
    .select("id,traite").in("id", ids)
  const lignes = (existants ?? []) as { id: string; traite: boolean }[]
  const relancables = lignes.filter(m => !m.traite).map(m => m.id)
  const ignores = ids.length - relancables.length
  if (!relancables.length) return { ok: true, traites: 0, ignores }

  const { error } = await admin.from("whatsapp_messages")
    .update({ en_traitement: false, tentatives: 0, erreur_traitement: null } as never)
    .in("id", relancables)
  if (error) return { ok: false, traites: 0, ignores, erreur: error.message }
  return { ok: true, traites: relancables.length, ignores }
}

/**
 * Supprime des messages.
 *
 * Les annonces déjà produites ne sont PAS touchées : leur lien vers le message
 * se vide simplement (`ON DELETE SET NULL`). On perd en revanche le texte
 * d'origine, donc la possibilité de retrouver l'annonce dans WhatsApp — d'où
 * l'avertissement côté interface.
 */
export async function supprimerMessages(ids: string[]): Promise<ResultatAction> {
  if (!ids.length) return { ok: false, traites: 0, ignores: 0, erreur: "Aucun message sélectionné." }
  if (ids.length > MAX_PAR_LOT) {
    return { ok: false, traites: 0, ignores: 0, erreur: `Maximum ${MAX_PAR_LOT} messages à la fois.` }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("whatsapp_messages").delete().in("id", ids)
  if (error) return { ok: false, traites: 0, ignores: 0, erreur: error.message }
  return { ok: true, traites: ids.length, ignores: 0 }
}

/**
 * Corrige le texte d'un message, puis le remet en file.
 *
 * Utile quand l'ingestion échoue sur une annonce mal recopiée — un prix collé
 * au texte, une ligne tronquée. Corriger puis relancer vaut mieux que de
 * ressaisir l'annonce à la main : la provenance (groupe, publieur, heure) est
 * conservée.
 */
export async function modifierMessage(id: string, contenu: string): Promise<ResultatAction> {
  const texte = contenu.trim()
  if (!texte) return { ok: false, traites: 0, ignores: 0, erreur: "Le texte ne peut pas être vide." }

  const admin = createAdminClient()
  const { data } = await admin.from("whatsapp_messages").select("traite").eq("id", id).maybeSingle()
  if (!data) return { ok: false, traites: 0, ignores: 0, erreur: "Message introuvable." }

  const { error } = await admin.from("whatsapp_messages")
    .update({
      contenu: texte.slice(0, 8000),
      // Corriger sans relancer ne servirait à rien : le message resterait
      // bloqué avec son ancienne erreur.
      en_traitement: false, tentatives: 0, erreur_traitement: null,
    } as never)
    .eq("id", id)
  if (error) return { ok: false, traites: 0, ignores: 0, erreur: error.message }
  return { ok: true, traites: 1, ignores: 0 }
}
