import { createAdminClient } from "@/lib/supabase/server"
import { notifyStaff } from "@/lib/notifications"

// ============================================================================
// SIGNALEMENT D'UNE ANNONCE — logique unique, site et application.
//
// Le site ouvre une fenêtre, enregistre dans `signalements` et alerte le staff.
// L'application, elle, se contentait d'ouvrir WhatsApp avec un message pré-écrit :
// le signalement n'existait nulle part en base, n'apparaissait dans aucun
// tableau de bord, et se perdait dans une conversation. Autant dire qu'il ne
// servait à rien — sauf à donner à l'utilisateur l'impression d'avoir agi.
//
// Ce module porte la logique commune pour que les deux chemins ne divergent
// pas : une catégorie ajoutée d'un côté et oubliée de l'autre produirait deux
// façons de signaler la même chose.
// ============================================================================

/** Motifs proposés. Ordre et libellés partagés par le site et l'application. */
export const CATEGORIES_SIGNALEMENT = [
  "Annonce frauduleuse",
  "Déjà vendu / loué",
  "Informations erronées",
  "Doublon",
  "Contenu inapproprié",
  "Autre",
] as const

export type ResultatSignalement = { ok: true } | { ok: false; error: string }

export interface EntreeSignalement {
  propertyId: string
  categorie?: string | null
  motif?: string | null
  contact?: string | null
  /** Identifiant du compte, quand la personne est connectée. */
  userId?: string | null
}

/** Coupe une saisie libre : une base n'a pas à stocker un roman collé au presse-papier. */
const borner = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim()
  return t ? t.slice(0, max) : null
}

/**
 * Enregistre le signalement et alerte le staff.
 *
 * Résilient si la migration 031 n'a pas été appliquée (`42P01` / `PGRST205`) :
 * la notification part quand même, le signalement n'est pas perdu.
 */
export async function enregistrerSignalement(e: EntreeSignalement): Promise<ResultatSignalement> {
  if (!e.propertyId) return { ok: false, error: "Annonce introuvable." }

  const admin = createAdminClient()
  const { data: propData } = await admin
    .from("properties").select("id, titre, quartier").eq("id", e.propertyId).maybeSingle()
  const prop = propData as { id: string; titre: string; quartier: string | null } | null
  if (!prop) return { ok: false, error: "Cette annonce n'existe plus." }

  const categorie = borner(e.categorie, 60)
  const motif = borner(e.motif, 1000)
  const contact = borner(e.contact, 120)

  const { error } = await admin.from("signalements").insert({
    property_id: e.propertyId,
    user_id: e.userId ?? null,
    categorie,
    motif,
    contact,
    statut: "nouveau",
  } as never)

  const tableAbsente = error?.code === "42P01" || error?.code === "PGRST205"
  if (error && !tableAbsente) {
    console.error("INAYA-DB-060", error)
    return { ok: false, error: "Échec de l'envoi du signalement. Réessayez." }
  }

  // Alerte staff : au mieux. Un signalement enregistré mais non notifié reste
  // visible dans l'administration ; l'inverse serait plus grave.
  try {
    const lieu = prop.quartier ? ` (${prop.quartier})` : ""
    const details = [categorie && `Catégorie : ${categorie}`, motif && `Motif : ${motif}`, contact && `Contact : ${contact}`]
      .filter(Boolean).join(" · ")
    await notifyStaff({
      type: "signalement",
      titre: "Annonce signalée",
      contenu: `« ${prop.titre} »${lieu} a été signalée.${details ? " " + details : " (sans motif précisé)"}`,
      payload: { property_id: e.propertyId, categorie, motif },
    })
  } catch (err) {
    console.error("INAYA-NOTIF-004", err)
  }

  return { ok: true }
}
