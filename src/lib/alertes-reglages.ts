import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// QUI EST ALERTÉ, PAR QUEL CANAL, ET DANS QUELLES LIMITES.
//
// POURQUOI CE FICHIER EXISTE.
//
// Les alertes de correspondance partent par SMS, et le SMS se paie. Sur le
// téléphone de l'agence, 2 400 messages en cinq jours ont vidé le forfait et
// l'ont laissé sec pendant six semaines. L'écrasante majorité de ce volume
// vient des demandes RECOPIÉES DES GROUPES WhatsApp : des gens qui n'ont jamais
// rien demandé à Inaya, dont la requête est souvent vague, et à qui l'on écrit
// pour chaque annonce qui ressemble de loin à leur message.
//
// À l'inverse, un client qui vient du site ou de l'application a formulé sa
// recherche lui-même et l'attend : celui-là doit être prévenu, toujours.
//
// D'où deux régimes distincts, réglables séparément par l'administration :
//
//   GROUPE      — demandes ingérées des groupes WhatsApp. Coûteuses, non
//                 sollicitées. Par défaut : WhatsApp seulement, correspondances
//                 exactes seulement, et des plafonds.
//   PLATEFORME  — site web, application mobile, comptes connectés. Par défaut :
//                 SMS ET WhatsApp, sans plafond — c'est le service promis.
//
// Tout est réglable sans redéploiement : un réglage qui coûte de l'argent doit
// pouvoir être coupé en trente secondes, depuis un téléphone, un dimanche.
// ============================================================================

export type OrigineDemande = "groupe" | "plateforme"

export interface ReglesGroupe {
  actives: boolean
  sms: boolean
  whatsapp: boolean
  /** N'alerter que sur les correspondances EXACTES, pas les « similaires ». */
  seulement_exactes: boolean
  /** Nombre minimal de critères renseignés (quartier, budget, pièces, surface, meublé). */
  criteres_minimum: number
  /** Ne pas alerter les demandes dont le budget déclaré est sous ce seuil. */
  budget_minimum: number | null
  /** Une demande plus ancienne que cela n'est plus démarchée. */
  anciennete_max_jours: number | null
  /** Alertes maximales par destinataire et par 24 h. */
  max_par_jour: number
  /** Destinataires maximum alertés pour UNE annonce publiée. */
  max_par_annonce: number
}

export interface ReglesPlateforme {
  actives: boolean
  sms: boolean
  whatsapp: boolean
}

export interface ReglesAlertes {
  /** Interrupteur général. Coupé, plus AUCUNE alerte de correspondance ne part. */
  actives: boolean
  groupe: ReglesGroupe
  plateforme: ReglesPlateforme
}

/**
 * Les valeurs par défaut sont celles qui coûtent le moins CÔTÉ GROUPE et qui
 * tiennent la promesse CÔTÉ PLATEFORME. Une base neuve, une clé absente ou une
 * lecture en échec doivent donner un système sobre, jamais un système qui vide
 * le forfait à l'insu de l'agence.
 */
export const REGLES_PAR_DEFAUT: ReglesAlertes = {
  actives: true,
  groupe: {
    actives: true,
    sms: false,          // ← le levier : le gros du volume ne coûte plus rien
    whatsapp: true,
    seulement_exactes: true,
    criteres_minimum: 2,
    budget_minimum: null,
    anciennete_max_jours: 60,
    max_par_jour: 2,
    max_par_annonce: 20,
  },
  plateforme: {
    actives: true,
    sms: true,
    whatsapp: true,
  },
}

const bool = (v: unknown, d: boolean) =>
  v === true || v === "true" || v === 1 || v === "1" ? true
  : v === false || v === "false" || v === 0 || v === "0" ? false : d

const entier = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d
}

const entierOuNul = (v: unknown, d: number | null) => {
  if (v === null || v === "" || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : d
}

/**
 * Lit les règles. Ne lève jamais : une panne de lecture rend les défauts, elle
 * n'interrompt pas la publication d'une annonce.
 *
 * Compatibilité : l'ancien réglage `alertes_groupe` (interrupteur d'arrêt
 * d'urgence, politique DG du 16/07/2026) continue de faire foi. Mis à `false`,
 * il coupe les alertes de groupe quoi que disent les règles détaillées — on ne
 * désarme pas un bouton d'arrêt en ajoutant un écran par-dessus.
 */
export async function lireReglesAlertes(
  db?: ReturnType<typeof createAdminClient>,
): Promise<ReglesAlertes> {
  const base = db ?? createAdminClient()
  try {
    const { data } = await base.from("app_settings")
      .select("key,value").in("key", ["alertes_regles", "alertes_groupe"])
    const lignes = (data ?? []) as { key: string; value: unknown }[]
    const brut = lignes.find(l => l.key === "alertes_regles")?.value
    const arretGroupe = lignes.find(l => l.key === "alertes_groupe")?.value

    const regles = fusionner(brut)
    if (arretGroupe === false || arretGroupe === "false") regles.groupe.actives = false
    return regles
  } catch (e) {
    console.error("INAYA-ALERTES-REGLES", e)
    return structuredClone(REGLES_PAR_DEFAUT)
  }
}

/** Applique un objet partiel (ou absent, ou mal formé) sur les défauts. */
export function fusionner(brut: unknown): ReglesAlertes {
  const d = REGLES_PAR_DEFAUT
  const o = (typeof brut === "string" ? tenterJson(brut) : brut) as
    Partial<{ actives: unknown; groupe: Record<string, unknown>; plateforme: Record<string, unknown> }> | null
  if (!o || typeof o !== "object") return structuredClone(d)

  const g = (o.groupe ?? {}) as Record<string, unknown>
  const p = (o.plateforme ?? {}) as Record<string, unknown>

  return {
    actives: bool(o.actives, d.actives),
    groupe: {
      actives: bool(g.actives, d.groupe.actives),
      sms: bool(g.sms, d.groupe.sms),
      whatsapp: bool(g.whatsapp, d.groupe.whatsapp),
      seulement_exactes: bool(g.seulement_exactes, d.groupe.seulement_exactes),
      criteres_minimum: entier(g.criteres_minimum, d.groupe.criteres_minimum, 0, 5),
      budget_minimum: entierOuNul(g.budget_minimum, d.groupe.budget_minimum),
      anciennete_max_jours: entierOuNul(g.anciennete_max_jours, d.groupe.anciennete_max_jours),
      max_par_jour: entier(g.max_par_jour, d.groupe.max_par_jour, 0, 50),
      max_par_annonce: entier(g.max_par_annonce, d.groupe.max_par_annonce, 0, 500),
    },
    plateforme: {
      actives: bool(p.actives, d.plateforme.actives),
      sms: bool(p.sms, d.plateforme.sms),
      whatsapp: bool(p.whatsapp, d.plateforme.whatsapp),
    },
  }
}

function tenterJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

/**
 * D'où vient la demande ?
 *
 * Un compte connecté OU un canal autre que « whatsapp » signifie que la
 * personne s'est adressée à nous : site, application, ou saisie par un agent.
 * Tout le reste vient des groupes.
 */
export function origineDemande(
  req: { canal?: string | null; user_id?: string | null },
): OrigineDemande {
  if (req.user_id) return "plateforme"
  if (req.canal && req.canal !== "whatsapp") return "plateforme"
  return "groupe"
}

/** Combien de critères la demande précise-t-elle réellement ? */
export function nombreDeCriteres(r: {
  zones?: string[] | null
  communes?: string[] | null
  budget_min?: number | null
  budget_max?: number | null
  surface_min?: number | null
  nb_pieces_min?: number | null
  meuble?: boolean | null
}): number {
  let n = 0
  if ((r.zones?.length ?? 0) > 0 || (r.communes?.length ?? 0) > 0) n++
  if (r.budget_max != null || r.budget_min != null) n++
  if (r.nb_pieces_min != null) n++
  if (r.surface_min != null) n++
  if (r.meuble === true) n++
  return n
}

/**
 * Les canaux autorisés pour cette origine, interrupteur général compris.
 * Renvoyer un objet plutôt que deux booléens : l'appelant doit pouvoir
 * constater « rien n'est autorisé » sans recomposer la règle.
 */
export function canauxAutorises(
  regles: ReglesAlertes,
  origine: OrigineDemande,
): { sms: boolean; whatsapp: boolean; aucun: boolean } {
  if (!regles.actives) return { sms: false, whatsapp: false, aucun: true }
  const r = origine === "groupe" ? regles.groupe : regles.plateforme
  if (!r.actives) return { sms: false, whatsapp: false, aucun: true }
  return { sms: r.sms, whatsapp: r.whatsapp, aucun: !r.sms && !r.whatsapp }
}

/**
 * Combien d'alertes SMS ce numéro a-t-il déjà reçues en 24 h ?
 *
 * Compté sur la file d'envoi, qui est la seule source qui dise ce qui a
 * réellement été ENGAGÉ — y compris les messages encore en attente. Compter sur
 * les notifications enregistrées laisserait passer une rafale entière avant que
 * la première ne soit envoyée.
 */
export async function alertesSmsDuJour(
  db: ReturnType<typeof createAdminClient>,
  telephone: string,
): Promise<number> {
  try {
    const depuis = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count } = await db.from("sms_queue")
      .select("id", { count: "exact", head: true })
      .eq("telephone", telephone).eq("type", "match")
      .gte("created_at", depuis)
    return count ?? 0
  } catch { return 0 }
}
