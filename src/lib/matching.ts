// ============================================================================
// Moteur de matching §6.9 — rapproche une OFFRE (annonce publiée) d'une
// DEMANDE (requête sauvegardée). Scoring par critères (exact vs similaire),
// écriture des `matches` et alerte du chercheur. Cross-canal (web/app/WhatsApp).
//
// NB : le matching SÉMANTIQUE par embeddings (pgvector) est prévu mais nécessite
// la génération d'embeddings côté service IA ; ici on fait un scoring par règles,
// déjà robuste pour le MVP.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { notifySearcher } from "@/lib/notifications"
import { isSearchExpired } from "@/lib/alert-expiry"
import { deduireCriteres } from "@/lib/demande-criteres"
import { analyserDemande, type Vocabulaire } from "@/lib/demande-completude"
import { chargerVocabulaireLieux } from "@/lib/vocabulaire-lieux"
import type { PropertyCat, PropertyType, MatchType } from "@/types/database"

export interface MatchableProperty {
  id: string
  titre: string
  description?: string | null
  type_offre: PropertyType
  categorie: PropertyCat
  prix: number
  quartier: string | null
  ville: string | null
  surface: number | null
  nb_pieces: number | null
  meuble: boolean
}

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

export interface MatchableRequest {
  id: string
  user_id: string | null
  contact_telephone: string | null
  canal: string | null
  type_offre: PropertyType | null
  categories: PropertyCat[] | null
  budget_min: number | null
  budget_max: number | null
  zones: string[] | null
  surface_min: number | null
  nb_pieces_min: number | null
  meuble: boolean | null
  /** Texte de la demande : seule source des critères quand les colonnes sont vides. */
  description_libre?: string | null
  /** Commune, distincte des quartiers de `zones` (migration 054). */
  commune?: string | null
  /**
   * `complete` | `a_valider` | `validee` | `rejetee` (migration 054).
   * ABSENT tant que la migration n'est pas appliquée : on retombe alors sur la
   * complétude calculée, qui applique la même règle sans la colonne.
   */
  statut_validation?: string | null
  /** NULL = alerte permanente (client final) ; renseigné = fin de vie (pro). */
  expire_at?: string | null
}

/**
 * Un chercheur peut-il recevoir une ALERTE WhatsApp ?
 * OUI seulement s'il a consenti : recherche enregistrée SUR LA PLATEFORME
 * (canal web/app, ou compte connecté). Les demandes extraites des groupes
 * WhatsApp (canal='whatsapp') ne sont PAS démarchées par défaut — envoyer des
 * messages non sollicités fait bannir le numéro par WhatsApp. L'admin peut
 * activer ces alertes de groupe à ses risques (réglage « alertes_groupe »).
 */
function mayNotify(req: MatchableRequest, allowGroupAlerts: boolean): boolean {
  if (req.canal && req.canal !== "whatsapp") return true   // plateforme (web/app) → consenti
  if (req.user_id) return true                             // compte connecté → consenti
  return allowGroupAlerts                                  // demande de groupe → seulement si activé
}

/**
 * Sous-ensemble des champs qui font qu'une demande est exploitable. Volontairement
 * plus permissif que `MatchableRequest` : les écrans d'administration n'exposent
 * pas toujours `surface_min`, et exiger un champ absent obligerait à recopier la
 * règle au lieu de l'importer — la divergence commence toujours là.
 */
export interface CriteresDemande {
  zones: string[] | null
  budget_min: number | null
  budget_max: number | null
  surface_min?: number | null
  nb_pieces_min: number | null
  meuble: boolean | null
}

/**
 * La demande a-t-elle le droit de DÉCLENCHER une alerte ?
 *
 * Règle de la direction : on n'écrit à quelqu'un que si le bien répond
 * réellement à ce qu'il cherche — ce qui suppose de savoir ce qu'il cherche.
 * Une demande dont un critère clé reste indéterminé est enregistrée, mais
 * n'envoie rien jusqu'à ce qu'un administrateur l'ait vérifiée et validée.
 *
 * Deux sources, dans cet ordre :
 *  1. la colonne `statut_validation`, qui porte la décision HUMAINE ;
 *  2. à défaut — colonne absente avant la migration 054 — la complétude
 *     calculée, qui applique la même règle.
 *
 * Le doute profite au client : tout ce qui n'est pas explicitement autorisé
 * reste muet.
 */
export function peutAlerter(r: MatchableRequest, vocab: Vocabulaire): boolean {
  const etat = r.statut_validation
  if (etat === "complete" || etat === "validee") return true
  if (etat === "a_valider" || etat === "rejetee") return false

  // Colonne absente : on tranche par le calcul.
  return analyserDemande({
    type_offre: r.type_offre, categories: r.categories, commune: r.commune,
    zones: r.zones, budget_min: r.budget_min, budget_max: r.budget_max,
    nb_pieces_min: r.nb_pieces_min, description_libre: r.description_libre,
  }, vocab).complete
}

/**
 * La demande exprime-t-elle un besoin ASSEZ PRÉCIS pour être démarchée ?
 *
 * Une demande sans le moindre critère — ni quartier, ni budget, ni pièces —
 * correspond à TOUT ce qui se publie. 35 numéros étaient dans ce cas : ils
 * recevaient une alerte pour chaque annonce, présentée comme « correspond à
 * votre recherche » alors qu'aucune recherche n'avait été formulée.
 *
 * Ces demandes restent enregistrées et leurs `matches` créés : un agent peut
 * les rappeler pour préciser le besoin. C'est seulement l'alerte AUTOMATIQUE
 * qu'on retient — démarcher quelqu'un sur tout le catalogue n'est pas un
 * service, et c'est le plus sûr moyen de faire résilier.
 */
export function demandeExploitable(r: CriteresDemande): boolean {
  return (r.zones?.length ?? 0) > 0
    || r.budget_max != null || r.budget_min != null
    || r.nb_pieces_min != null || r.surface_min != null
    || r.meuble === true
}

/**
 * Les demandes ingérées d'un groupe WhatsApp peuvent-elles être démarchées ?
 * Politique DG (2026-07-16) : OUI par défaut — on contacte tous les demandeurs.
 * `app_settings.alertes_groupe = false` reste un INTERRUPTEUR D'ARRÊT d'urgence
 * (ex. si le numéro est menacé de restriction).
 */
async function groupAlertsEnabled(db: ReturnType<typeof createAdminClient>): Promise<boolean> {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", "alertes_groupe").maybeSingle()
    return (data as { value?: unknown } | null)?.value !== false
  } catch { return true }
}

export interface MatchScore { type: MatchType; score: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Évalue la correspondance offre↔demande.
 * Renvoie null si critère bloquant non respecté ou score trop faible.
 */
export function evaluateMatch(p: MatchableProperty, r: MatchableRequest): MatchScore | null {
  // Une colonne vide ne veut pas dire « tout convient » : elle veut dire que
  // l'extraction n'a pas su remplir le champ. Le texte de la demande, lui, le
  // dit presque toujours. Sans cette lecture, une personne réclamant « deux ou
  // trois chambres salon » recevait des studios, et « non renseigné » servait
  // de laissez-passer à toutes les catégories.
  const deduits = deduireCriteres(r.description_libre)
  const categories = r.categories?.length ? r.categories : deduits.categories
  const typeOffre  = r.type_offre ?? deduits.typeOffre

  // Critères bloquants
  if (typeOffre && p.type_offre !== typeOffre) return null
  if (categories && categories.length > 0 && !categories.includes(p.categorie)) return null

  let score = 1
  let soft = 0

  // Budget max : au-dessus de +15 % => éliminé
  if (r.budget_max != null) {
    if (p.prix <= r.budget_max) { /* ok */ }
    else if (p.prix <= r.budget_max * 1.15) { score -= 0.2; soft++ }
    else return null
  }
  // Budget min : moins cher que souhaité => acceptable mais imparfait
  if (r.budget_min != null && p.prix < r.budget_min) { score -= 0.1; soft++ }

  // Zone(s) — la demande stocke commune ET quartiers dans `zones`. On les cherche
  // (tolérant : accents + sous-chaîne) dans la ville, le quartier, le titre et la
  // description du bien. Ainsi la COMMUNE est bien prise en compte (avant : on ne
  // comparait qu'au quartier, en égalité stricte → commune ignorée).
  //
  // CRITÈRE BLOQUANT, et non plus une simple pénalité.
  //
  // Un −0.35 laissait 0.65, très au-dessus du seuil de 0.4 : une personne qui
  // cherchait à Assoumankro recevait une alerte pour un bien à Laraba. Sur une
  // annonce réelle, 294 des 379 alertes (78 %) partaient vers des gens ayant
  // nommé un AUTRE quartier.
  //
  // Or le quartier est le critère le plus décisif de l'immobilier : celui qui
  // le nomme dit aussi où il n'ira pas — proximité du travail, de l'école, de
  // la famille. Le lui opposer n'est pas une approximation tolérable, c'est se
  // tromper sur l'essentiel. La tolérance reste large côté correspondance
  // (accents, sous-chaîne, commune incluse) : qui saisit « Bouaké » matche
  // toute la ville.
  if (r.zones && r.zones.length > 0) {
    const hay = stripAccents(`${p.quartier ?? ""} ${p.ville ?? ""} ${p.titre ?? ""} ${p.description ?? ""}`)
    const zones = r.zones.map(stripAccents).filter(Boolean)
    if (zones.length > 0 && !zones.some(z => hay.includes(z))) return null
  }
  // Surface minimale
  if (r.surface_min != null && p.surface != null && p.surface < r.surface_min) { score -= 0.15; soft++ }
  // Pièces minimales
  if (r.nb_pieces_min != null && p.nb_pieces != null && p.nb_pieces < r.nb_pieces_min) { score -= 0.15; soft++ }
  // Meublé exigé
  if (r.meuble === true && p.meuble === false) { score -= 0.1; soft++ }

  if (score < 0.4) return null
  return { type: soft === 0 ? "exacte" : "similaire", score: round2(score) }
}

const PROP_COLS = "id,titre,description,type_offre,categorie,prix,quartier,ville,surface,nb_pieces,meuble"
// select("*") : inclut expire_at (migration 045) tout en restant fonctionnel si
// la colonne n'existe pas encore (un select explicite ferait 42703).
const REQ_COLS = "*"

/**
 * Matche une annonce nouvellement publiée contre toutes les requêtes actives.
 * Crée les nouveaux `matches` et alerte les chercheurs concernés.
 * Renvoie le nombre de nouveaux matches.
 */
export async function runMatchingForProperty(propertyId: string): Promise<number> {
  const db = createAdminClient()

  const { data: propData } = await db.from("properties").select(PROP_COLS).eq("id", propertyId).single()
  const property = propData as MatchableProperty | null
  if (!property) return 0

  const [{ data: reqData }, { data: existing }] = await Promise.all([
    db.from("search_requests").select(REQ_COLS).eq("statut", "active"),
    db.from("matches").select("search_request_id").eq("property_id", propertyId),
  ])
  // Alertes EXPIRÉES (durée de vie des alertes pro, migration 045) : ni matchées
  // ni notifiées. Les alertes des clients finaux (expire_at NULL) sont permanentes.
  const requests = ((reqData ?? []) as MatchableRequest[]).filter(r => !isSearchExpired(r))
  const already = new Set((existing ?? []).map(m => (m as { search_request_id: string }).search_request_id))
  const allowGroup = await groupAlertsEnabled(db)

  // UNE personne, UNE alerte par annonce.
  //
  // Le garde-fou `already` ne dédoublonne que par DEMANDE. Or une même personne
  // enregistre plusieurs recherches — jusqu'à 40 pour un même numéro en
  // production. Une annonce publiée déclenchait donc une alerte PAR RECHERCHE :
  // 40 SMS identiques au même client, en quelques secondes. Du démarchage
  // agressif payé au message, et le plus sûr moyen de faire fuir précisément
  // les clients les plus engagés.
  //
  // Les matches, eux, restent tous créés : ils servent au suivi et à
  // l'historique. Seule l'ALERTE est unique par destinataire.
  // Chargé UNE fois pour toute l'annonce : la complétude est évaluée pour
  // chaque demande, et relire le parc à chaque fois serait absurde.
  const vocab = await chargerVocabulaireLieux()
  const dejaAlertes = new Set<string>()
  const destinataire = (r: MatchableRequest) =>
    (r.user_id ?? r.contact_telephone ?? "").replace(/\D/g, "") || r.id

  // Les correspondances exactes d'abord : si une personne a une recherche
  // exacte et cinq approchantes, elle doit recevoir « correspond à votre
  // recherche », pas « un bien similaire ».
  const parPertinence = requests
    .map(r => ({ r, m: already.has(r.id) ? null : evaluateMatch(property, r) }))
    .sort((a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0))

  let created = 0
  for (const { r: req, m } of parPertinence) {
    if (already.has(req.id)) continue
    if (!m) continue

    const { error } = await db.from("matches").insert({
      property_id: propertyId, search_request_id: req.id, type: m.type, score: m.score, statut: "genere",
    } as never)
    if (error) { if (error.code !== "23505") console.error("INAYA-MATCH-001", error.message); continue }

    created++
    // Alerte UNIQUEMENT les chercheurs consentis (plateforme). Les demandes de
    // groupe restent enregistrées (match créé) mais ne sont pas démarchées.
    const cle = destinataire(req)
    if (mayNotify(req, allowGroup) && demandeExploitable(req)
        && peutAlerter(req, vocab) && !dejaAlertes.has(cle)) {
      dejaAlertes.add(cle)
      await notifySearcher({
        userId: req.user_id, contactTel: req.contact_telephone,
        propertyTitre: property.titre, quartier: property.quartier,
        propertyId, requestId: req.id, type: m.type,
        prix: property.prix, typeOffre: property.type_offre,
      })
      await db.from("matches").update({ statut: "notifie", notifie_le: new Date().toISOString() } as never)
        .eq("property_id", propertyId).eq("search_request_id", req.id)
    }
  }
  return created
}

/**
 * Matche une requête (nouvelle ou ré-évaluée) contre les annonces publiées.
 * Crée les `matches` manquants. Renvoie les ids d'annonces correspondantes.
 */
export async function runMatchingForRequest(requestId: string, opts: { notify?: boolean } = {}): Promise<string[]> {
  const db = createAdminClient()

  const { data: reqData } = await db.from("search_requests").select(REQ_COLS).eq("id", requestId).single()
  const request = reqData as MatchableRequest | null
  if (!request || isSearchExpired(request)) return []

  // Pré-filtre large pour limiter la charge ; le scoring fin fait le reste.
  let q = db.from("properties").select(PROP_COLS).eq("statut", "publie").limit(500)
  if (request.type_offre) q = q.eq("type_offre", request.type_offre)
  const { data: propData } = await q
  const properties = (propData ?? []) as MatchableProperty[]

  const { data: existing } = await db.from("matches").select("property_id").eq("search_request_id", requestId)
  const already = new Set((existing ?? []).map(m => (m as { property_id: string }).property_id))

  const matched: string[] = []
  for (const property of properties) {
    const m = evaluateMatch(property, request)
    if (!m) continue
    matched.push(property.id)
    if (already.has(property.id)) continue

    const { error } = await db.from("matches").insert({
      property_id: property.id, search_request_id: requestId, type: m.type, score: m.score, statut: "genere",
    } as never)
    if (error) { if (error.code !== "23505") console.error("INAYA-MATCH-002", error.message); continue }

    if (opts.notify && mayNotify(request, await groupAlertsEnabled(db))
        && demandeExploitable(request)
        && peutAlerter(request, await chargerVocabulaireLieux())) {
      await notifySearcher({
        userId: request.user_id, contactTel: request.contact_telephone,
        propertyTitre: property.titre, quartier: property.quartier,
        propertyId: property.id, requestId, type: m.type,
        prix: property.prix, typeOffre: property.type_offre,
      })
      await db.from("matches").update({ statut: "notifie", notifie_le: new Date().toISOString() } as never)
        .eq("property_id", property.id).eq("search_request_id", requestId)
    }
  }
  return matched
}
