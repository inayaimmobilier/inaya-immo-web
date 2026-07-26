// ============================================================================
// Repli déterministe des assistants (web + WhatsApp) quand le LLM est indisponible
// (clé non configurée, crédit épuisé, erreur fournisseur). Plutôt que de laisser
// l'assistant muet, on analyse le message par mots-clés et on renvoie de VRAIS
// biens via le moteur de recherche partagé. Ainsi Maryama et l'assistant in-app
// restent utiles même sans IA. Aucune invention : uniquement des annonces réelles.
// ============================================================================
import { searchProperties, type SearchArgs, type ScoredProperty } from "@/lib/property-search"

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Extrait un budget max approximatif (« 50 000 », « 2 millions », « 150k »). */
function parseBudget(t: string): number | undefined {
  // « 2 millions » / « 2 M »
  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*(?:millions?|m(?:io)?\b)/)
  if (mil) return Math.round(parseFloat(mil[1].replace(",", ".")) * 1_000_000)
  // « 150k » / « 150 000 » / « 150000 »
  const k = t.match(/(\d+(?:[.,]\d+)?)\s*k\b/)
  if (k) return Math.round(parseFloat(k[1].replace(",", ".")) * 1000)
  const grp = t.match(/(\d[\d\s.]{2,}\d)/)
  if (grp) {
    const n = Number(grp[1].replace(/[\s.]/g, ""))
    if (Number.isFinite(n) && n >= 1000) return n
  }
  return undefined
}

/** Analyse heuristique d'un message client → critères de recherche. */
export function parseAssistantQuery(text: string): SearchArgs {
  const t = stripAccents(text)
  const args: SearchArgs = {}

  if (/\b(a\s*louer|louer|location|en\s*location|loyer)\b/.test(t)) args.type_offre = "location"
  else if (/\b(a\s*vendre|vendre|vente|achat|acheter|a\s*acheter)\b/.test(t)) args.type_offre = "vente"
  else if (/\b(cession|ceder|a\s*ceder|pas\s*de\s*porte|fonds\s*de\s*commerce)\b/.test(t)) args.type_offre = "cession"
  else if (/\b(meuble|meublee|residence|court\s*sejour|par\s*nuit)\b/.test(t)) args.type_offre = "residence_meublee"

  const cats: string[] = []
  if (/\bstudio/.test(t)) cats.push("studio")
  if (/\bappart/.test(t)) cats.push("appartement")
  if (/\b(villa|duplex)\b/.test(t)) cats.push("maison")
  if (/\bmaison|logement|habitation\b/.test(t)) cats.push("maison", "appartement", "studio")
  if (/\b(terrain|parcelle|lot|ilot)\b/.test(t)) cats.push("terrain")
  if (/\b(magasin|boutique)\b/.test(t)) cats.push("magasin")
  if (/\b(local|commerce|commercial|bureau|entrepot)\b/.test(t)) cats.push("local_commercial", "bureau")
  if (cats.length) args.categories = [...new Set(cats)]

  const budget = parseBudget(t)
  if (budget) args.prix_max = budget

  const ch = t.match(/(\d+)\s*(?:chambre|piece|pieces|chambres)/)
  if (ch) args.chambres_min = Number(ch[1])

  // Le texte complet sert aussi de mots-clés (le moteur cherche dans titre/desc,
  // gère les quartiers/communes cités, « entrée couchée », etc.).
  args.mots_cles = text.slice(0, 140)
  return args
}

/** Recherche de repli : renvoie de vrais biens (max 6) pour un message client. */
export async function assistantFallbackRows(text: string): Promise<ScoredProperty[]> {
  const clean = (text ?? "").trim()
  if (clean.length < 2) return []
  try {
    return await searchProperties(parseAssistantQuery(clean), { limit: 6 })
  } catch {
    return []
  }
}

/** Dernier message utilisateur d'un historique. */
export function lastUserText(history: { role: string; text: string }[]): string {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "user") return history[i].text
  return ""
}
