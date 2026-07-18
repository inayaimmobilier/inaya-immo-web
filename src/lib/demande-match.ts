// ============================================================================
// Réponse automatique à une DEMANDE ingérée d'un groupe WhatsApp.
//   À l'ingestion d'une demande (« je cherche un 2 pièces à Koko »), on cherche
//   les biens correspondants et on envoie UN SEUL message récapitulatif DIRECTEMENT
//   sur le WhatsApp du demandeur (jamais dans le groupe). Si rien ne correspond,
//   on accuse réception : la recherche reste active et alertera au futur match.
//
// GARDE-FOUS ANTI-BAN (le demandeur est contacté « à froid ») :
//   - UN SEUL message par demande (jamais un par bien) ;
//   - au plus TOP_N biens cités ;
//   - pas de relance si ce numéro a déjà reçu une réponse de demande récemment
//     (COOLDOWN_H) ;
//   - l'envoi effectif est ÉTALÉ par le dispatcher (anti-rafale) ;
//   - STOP toujours proposé (consentement).
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { evaluateMatch, type MatchableProperty, type MatchableRequest } from "@/lib/matching"
import { absoluteUrl } from "@/lib/site"

const TOP_N = 5
const COOLDOWN_H = 6

const REQ_COLS = "id,user_id,contact_telephone,canal,type_offre,categories,budget_min,budget_max,zones,surface_min,nb_pieces_min,meuble,statut"
const PROP_COLS = "id,reference,titre,type_offre,categorie,prix,quartier,ville,surface,nb_pieces,meuble"

type PropRow = MatchableProperty & { reference: number | null; ville: string | null }

const fmt = (n: number) => n.toLocaleString("fr-FR")

function prixTexte(p: PropRow): string {
  if (p.prix && p.prix > 0) {
    const suffixe = p.type_offre === "location" ? "/mois" : p.type_offre === "residence_meublee" ? "/nuit" : ""
    return `${fmt(p.prix)} FCFA${suffixe}`
  }
  return "Prix sur demande"
}

function lien(p: PropRow): string {
  return p.reference != null ? absoluteUrl(`/annonces/${p.reference}`) : absoluteUrl(`/biens/${p.id}`)
}

function blocBien(p: PropRow): string {
  const lieu = [p.quartier, p.ville].filter(Boolean).join(", ")
  const num = p.reference != null ? `N°${p.reference} — ` : ""
  // Titre plafonné : un titre ingéré démesuré consommerait tout le budget du
  // message (et le ferait tronquer derrière « Voir plus » côté WhatsApp).
  const titre = p.titre.length > 80 ? `${p.titre.slice(0, 79).trimEnd()}…` : p.titre
  return `*${num}${titre}*\n💰 ${prixTexte(p)}${lieu ? ` · 📍 ${lieu}` : ""}\n🔗 ${lien(p)}`
}

/**
 * Traite une demande : cherche les biens, crée UNE notification WhatsApp pour le
 * demandeur. Renvoie le nombre de biens trouvés. Best-effort, ne lève jamais.
 */
export async function respondToDemande(requestId: string): Promise<{ matched: number; sent: boolean; skipped?: string }> {
  const db = createAdminClient()

  const { data: reqData } = await db.from("search_requests").select(REQ_COLS).eq("id", requestId).maybeSingle()
  const request = reqData as (MatchableRequest & { statut: string }) | null
  if (!request) return { matched: 0, sent: false, skipped: "introuvable" }
  if (request.statut !== "active") return { matched: 0, sent: false, skipped: "inactive" }

  const tel = request.contact_telephone?.trim()
  if (!tel) return { matched: 0, sent: false, skipped: "sans_numero" }

  // Garde-fou anti-ban : pas de nouvelle réponse « à froid » si ce numéro en a déjà
  // reçu une récemment (il a pu poster plusieurs demandes d'affilée).
  const cutoff = new Date(Date.now() - COOLDOWN_H * 3_600_000).toISOString()
  const { data: recent } = await db.from("notifications")
    .select("id").eq("contact_telephone", tel).eq("type", "demande_reponse")
    .gte("created_at", cutoff).limit(1)
  if (recent && recent.length > 0) return { matched: 0, sent: false, skipped: "cooldown" }

  // Pré-filtre large puis scoring fin (même moteur que le matching des annonces).
  let q = db.from("properties").select(PROP_COLS).eq("statut", "publie").limit(300)
  if (request.type_offre) q = q.eq("type_offre", request.type_offre)
  const { data: propData } = await q
  const props = (propData ?? []) as PropRow[]

  const scored = props
    .map(p => ({ p, m: evaluateMatch(p, request) }))
    .filter((x): x is { p: PropRow; m: { type: "exacte" | "similaire"; score: number } } => x.m != null)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, TOP_N)

  let contenu: string
  let titre: string
  if (scored.length > 0) {
    titre = "Inaya Immo — biens pour votre recherche"
    // WhatsApp TRONQUE (« Voir plus ») les messages au-delà d'~700-800 caractères.
    // Pour que le client voie tout SANS cliquer, on compose sous un BUDGET : on
    // ajoute les biens (les mieux classés d'abord) tant que le message tient,
    // avec au moins 1 bien. Les biens écartés restent matchés en base (alertes).
    const CHAR_BUDGET = 650
    const footer = [
      "",
      "Ouvre le lien qui t'intéresse et clique sur *Demander une visite* 😊",
      "📇 Astuce : enregistre ce numéro (Inaya Immo) pour que les liens soient cliquables.",
      "Répondez STOP pour ne plus recevoir de propositions.",
    ].join("\n")
    const blocs = scored.map(x => blocBien(x.p))
    const kept: string[] = []
    const introFor = (n: number) =>
      `Bonjour 👋 Je suis *Miss Maryama*, d'Inaya Immo. J'ai vu votre recherche et voici ${n} bien${n > 1 ? "s" : ""} qui pourrai${n > 1 ? "ent" : "t"} vous intéresser 👇`
    for (const bloc of blocs) {
      const candidat = [introFor(kept.length + 1), "", [...kept, bloc].join("\n\n"), footer].join("\n")
      if (kept.length > 0 && candidat.length > CHAR_BUDGET) break
      kept.push(bloc)
    }
    contenu = [introFor(kept.length), "", kept.join("\n\n"), footer].join("\n")
  } else {
    titre = "Inaya Immo — recherche enregistrée"
    contenu = [
      "Bonjour 👋 Je suis *Miss Maryama*, d'Inaya Immo. J'ai bien noté votre recherche de bien.",
      "Aucun bien ne correspond pour l'instant, mais je vous préviens dès qu'un bien arrive. 🔎",
      "Répondez STOP pour ne plus recevoir de propositions.",
    ].join("\n")
  }

  const { error } = await db.from("notifications").insert({
    contact_telephone: tel,
    canal: "whatsapp",
    type: "demande_reponse",
    titre,
    contenu,
    payload: { search_request_id: requestId },
    lu: false,
    envoye: false,
  } as never)
  if (error) { console.error("INAYA-DEMANDE-001", error.message); return { matched: scored.length, sent: false, skipped: "insert_error" } }

  return { matched: scored.length, sent: true }
}
