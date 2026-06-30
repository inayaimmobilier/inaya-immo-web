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
import type { PropertyCat, PropertyType, MatchType } from "@/types/database"

export interface MatchableProperty {
  id: string
  titre: string
  type_offre: PropertyType
  categorie: PropertyCat
  prix: number
  quartier: string | null
  surface: number | null
  nb_pieces: number | null
  meuble: boolean
}

export interface MatchableRequest {
  id: string
  user_id: string | null
  contact_telephone: string | null
  type_offre: PropertyType | null
  categories: PropertyCat[] | null
  budget_min: number | null
  budget_max: number | null
  zones: string[] | null
  surface_min: number | null
  nb_pieces_min: number | null
  meuble: boolean | null
}

export interface MatchScore { type: MatchType; score: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Évalue la correspondance offre↔demande.
 * Renvoie null si critère bloquant non respecté ou score trop faible.
 */
export function evaluateMatch(p: MatchableProperty, r: MatchableRequest): MatchScore | null {
  // Critères bloquants
  if (r.type_offre && p.type_offre !== r.type_offre) return null
  if (r.categories && r.categories.length > 0 && !r.categories.includes(p.categorie)) return null

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

  // Zone
  if (r.zones && r.zones.length > 0) {
    const z = (p.quartier ?? "").trim().toLowerCase()
    const hit = z && r.zones.some(rz => rz.trim().toLowerCase() === z)
    if (!hit) { score -= 0.25; soft++ }
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

const PROP_COLS = "id,titre,type_offre,categorie,prix,quartier,surface,nb_pieces,meuble"
const REQ_COLS = "id,user_id,contact_telephone,type_offre,categories,budget_min,budget_max,zones,surface_min,nb_pieces_min,meuble"

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
  const requests = (reqData ?? []) as MatchableRequest[]
  const already = new Set((existing ?? []).map(m => (m as { search_request_id: string }).search_request_id))

  let created = 0
  for (const req of requests) {
    if (already.has(req.id)) continue
    const m = evaluateMatch(property, req)
    if (!m) continue

    const { error } = await db.from("matches").insert({
      property_id: propertyId, search_request_id: req.id, type: m.type, score: m.score, statut: "genere",
    } as never)
    if (error) { if (error.code !== "23505") console.error("INAYA-MATCH-001", error.message); continue }

    created++
    await notifySearcher({
      userId: req.user_id, contactTel: req.contact_telephone,
      propertyTitre: property.titre, quartier: property.quartier,
      propertyId, requestId: req.id, type: m.type,
    })
    await db.from("matches").update({ statut: "notifie", notifie_le: new Date().toISOString() } as never)
      .eq("property_id", propertyId).eq("search_request_id", req.id)
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
  if (!request) return []

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

    if (opts.notify) {
      await notifySearcher({
        userId: request.user_id, contactTel: request.contact_telephone,
        propertyTitre: property.titre, quartier: property.quartier,
        propertyId: property.id, requestId, type: m.type,
      })
      await db.from("matches").update({ statut: "notifie", notifie_le: new Date().toISOString() } as never)
        .eq("property_id", property.id).eq("search_request_id", requestId)
    }
  }
  return matched
}
