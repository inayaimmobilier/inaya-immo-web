import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { runAssistant, type ToolSpec, type ChatTurn } from "@/lib/llm"
import { SITE_URL } from "@/lib/site"

// ============================================================================
// Assistant IA WhatsApp (interne) — appelé par le whatsapp-service pour répondre
// aux DM des clients sur le numéro Inaya. Il guide le client et partage les infos
// PUBLIQUES du bien : numéro d'annonce (référence), prix, localisation et lien web.
// Il NE partage JAMAIS le téléphone du publieur/propriétaire (réservé à l'admin,
// au modérateur et à l'agent assigné) : la mise en relation passe par la fiche.
// Il retrouve une annonce par son NUMÉRO (référence), une partie du TITRE, ou
// des CRITÈRES.
// Sécurité : secret partagé = SUPABASE_SERVICE_ROLE_KEY (jamais exposé au client).
// ============================================================================

export const dynamic = "force-dynamic"

const SYSTEM = `Tu es l'assistant WhatsApp d'Inaya Immo (immobilier à Bouaké, Côte d'Ivoire). Ton rôle : CONSEILLER brièvement, MOTIVER, et REDIRIGER vers le site inaya.ci. Réponds en français.

STYLE — RÈGLE N°1 : messages TRÈS COURTS (2-4 lignes max), chaleureux, allant droit au but. Pas de longs paragraphes, pas de listes interminables. Une seule question à la fois. Termine souvent en invitant à ouvrir le bien sur inaya.ci.

CONFIDENTIALITÉ — RÈGLE ABSOLUE : tu ne donnes JAMAIS le numéro de téléphone du propriétaire/annonceur, ni aucune coordonnée personnelle. La mise en relation est assurée par Inaya : invite le client à ouvrir le lien du bien et à faire une demande via « Contacter / Demander une visite ». Si un client insiste pour avoir le numéro, explique poliment qu'Inaya gère la mise en relation pour sa sécurité, et propose de transmettre sa demande.

OUTILS :
- "trouver_annonce" : retrouve une annonce précise par son NUMÉRO (référence, ex. 1042), par une partie du TITRE, ou un identifiant. Utilise-le dès qu'un client mentionne un numéro d'annonce ou un titre.
- "rechercher_annonces" : recherche par critères (type d'opération, catégorie, commune, quartier, budget, chambres). Utilise-le pour une demande par critères.
- "lister_zones" : communes et quartiers couverts.

RÈGLES :
- Ne JAMAIS inventer un bien, un prix ou un numéro : utilise toujours les outils et ne cite que ce qu'ils renvoient. Les outils ne renvoient PAS de téléphone — n'en invente aucun.
- Présente chaque bien clairement : « N°{reference} — {titre} · {prix_texte} · {localisation}. Détails et mise en relation : {url} ».
- Si "prix_texte" = "Prix sur demande", écris-le tel quel (jamais « 0 FCFA »).
- Avant de rechercher par critères, si le besoin est flou, pose UNE question courte (louer/acheter ? quelle commune ? budget ?). Ne fais pas de longue liste de questions.
- En Côte d'Ivoire : « X chambres salon » = X+1 pièces. « maison » au sens large = tout logement (utilise plusieurs catégories). Petits commerces = catégorie "local_commercial".
- Résidences meublées : court séjour, prix par nuit ; univers séparé (type_offre="residence_meublee").
- Si aucun résultat, dis-le franchement et propose d'élargir. Montants en FCFA.`

type Row = {
  id: string; reference: number | null; titre: string; description: string | null
  type_offre: string; categorie: string; prix: number | null; prix_m2: number | null
  surface: number | null; nb_pieces: number | null; nb_chambres: number | null
  quartier: string | null; ville: string | null; meuble: boolean | null; tarif_periode: string | null
  created_by: string | null
}

const fmt = (n: number) => n.toLocaleString("fr-FR")
const PERIODE: Record<string, string> = { nuit: "/nuit", semaine: "/semaine", mois: "/mois" }

function prixTexte(p: Row): string {
  if (p.categorie === "terrain" && p.prix_m2) return `${fmt(p.prix_m2)} FCFA/m²${p.prix ? ` (${fmt(p.prix)} FCFA)` : ""}`
  if (p.prix && p.prix > 0) {
    const isResid = p.type_offre === "residence_meublee"
    const suffixe = isResid ? (PERIODE[p.tarif_periode ?? "nuit"] ?? "/nuit") : (p.type_offre === "location" ? "/mois" : "")
    return `${fmt(p.prix)} FCFA${suffixe}`
  }
  return "Prix sur demande"
}

// IMPORTANT : le téléphone du publieur/propriétaire n'est JAMAIS renvoyé au
// client. La mise en relation se fait via la fiche du bien (/biens/{id}) ; seuls
// l'admin, le modérateur et l'agent assigné au lead accèdent au contact.
function present(rows: Row[]) {
  return rows.map(p => ({
    reference: p.reference,
    // URL courte lisible « /annonces/1664 » (redirige vers la fiche) ; repli UUID.
    url: p.reference != null ? `${SITE_URL}/annonces/${p.reference}` : `${SITE_URL}/biens/${p.id}`,
    titre: p.titre,
    type_offre: p.type_offre,
    type_libelle: p.type_offre === "residence_meublee" ? "Résidence meublée" : p.type_offre,
    categorie: p.categorie,
    prix_texte: prixTexte(p),
    localisation: [p.quartier, p.ville].filter(Boolean).join(", ") || "Localisation non précisée",
    nb_pieces: p.nb_pieces, nb_chambres: p.nb_chambres, surface: p.surface,
  }))
}

// select("*") plutôt que colonnes explicites : reste fonctionnel même si la
// colonne "reference" (migration 039) n'est pas encore appliquée (→ undefined).
const SELECT = "*"

type SearchArgs = {
  type_offre?: string; categorie?: string; categories?: string[]; commune?: string; quartier?: string
  prix_min?: number; prix_max?: number; chambres_min?: number; tri?: "recent" | "prix_asc" | "prix_desc"
}

// Retire les accents et échappe les caractères cassant la syntaxe .or().
const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
const cleanTerm = (s: string) => s.replace(/[(),]/g, " ").trim()

async function rechercherAnnonces(args: SearchArgs) {
  const admin = createAdminClient()
  let q = admin.from("properties").select(SELECT).eq("statut", "publie").limit(12)
  if (args.type_offre === "residence_meublee") q = q.eq("type_offre", "residence_meublee")
  else if (args.type_offre) q = q.eq("type_offre", args.type_offre)
  else q = q.neq("type_offre", "residence_meublee")
  if (args.categories?.length) q = q.in("categorie", args.categories)
  else if (args.categorie) q = q.eq("categorie", args.categorie)
  if (args.commune) q = q.ilike("ville", `%${args.commune}%`)
  // Quartier cherché sur titre + description + quartier (beaucoup d'annonces WhatsApp
  // ont le quartier dans le titre), avec et sans accents.
  if (args.quartier) {
    const term = cleanTerm(args.quartier)
    if (term) {
      const variants = Array.from(new Set([term, stripAccents(term)]))
      q = q.or(variants.flatMap(v => [`quartier.ilike.%${v}%`, `titre.ilike.%${v}%`, `description.ilike.%${v}%`]).join(","))
    }
  }
  if (typeof args.prix_min === "number") q = q.gte("prix", args.prix_min)
  if (typeof args.prix_max === "number") q = q.lte("prix", args.prix_max)
  if (typeof args.chambres_min === "number") q = q.gte("nb_chambres", args.chambres_min)
  if (args.tri === "prix_asc") q = q.gt("prix", 0).order("prix", { ascending: true })
  else if (args.tri === "prix_desc") q = q.order("prix", { ascending: false })
  else q = q.order("created_at", { ascending: false })
  const { data, error } = await q
  if (error) return { erreur: "Recherche indisponible." }
  const rows = (data ?? []) as Row[]
  return { nombre: rows.length, resultats: present(rows) }
}

/** Recherche par numéro (référence), identifiant, ou fragment de titre. */
async function trouverAnnonce(args: { numero?: number | string; titre?: string }) {
  const admin = createAdminClient()
  const rows: Row[] = []

  // 1) Numéro (référence courte) ou UUID.
  if (args.numero != null && String(args.numero).trim()) {
    const raw = String(args.numero).trim()
    const asNum = Number(raw.replace(/\D/g, ""))
    if (Number.isFinite(asNum) && asNum > 0) {
      const { data } = await admin.from("properties").select(SELECT).eq("statut", "publie").eq("reference", asNum).limit(1)
      rows.push(...((data ?? []) as Row[]))
    }
    if (rows.length === 0 && /^[0-9a-f-]{6,}$/i.test(raw)) {
      const { data } = await admin.from("properties").select(SELECT).eq("statut", "publie").ilike("id", `${raw}%`).limit(1)
      rows.push(...((data ?? []) as Row[]))
    }
  }

  // 2) Fragment de titre (full-text puis ilike de repli).
  if (rows.length === 0 && args.titre?.trim()) {
    const term = args.titre.trim()
    const { data } = await admin.from("properties").select(SELECT).eq("statut", "publie")
      .or(`titre.ilike.%${term}%,description.ilike.%${term}%`).limit(4)
    rows.push(...((data ?? []) as Row[]))
  }

  if (rows.length === 0) return { nombre: 0, resultats: [] }
  return { nombre: rows.length, resultats: present(rows) }
}

async function listerZones() {
  const admin = createAdminClient()
  const [{ data: villes }, { data: quartiers }] = await Promise.all([
    admin.from("villes").select("id,nom").eq("actif", true).order("ordre"),
    admin.from("quartiers").select("ville_id,nom").eq("actif", true).order("ordre"),
  ])
  const vById = new Map<string, string>()
  for (const v of (villes ?? []) as { id: string; nom: string }[]) vById.set(v.id, v.nom)
  const byCommune: Record<string, string[]> = {}
  for (const qr of (quartiers ?? []) as { ville_id: string; nom: string }[]) {
    const c = vById.get(qr.ville_id); if (!c) continue
    ;(byCommune[c] ??= []).push(qr.nom)
  }
  return { communes: byCommune }
}

const TOOLS: ToolSpec[] = [
  {
    name: "trouver_annonce",
    description: "Retrouve une annonce précise par son NUMÉRO (référence, ex. 1042), un identifiant, ou une partie du TITRE.",
    parameters: {
      type: "object",
      properties: {
        numero: { type: "string", description: "Numéro d'annonce (référence courte) ou identifiant." },
        titre: { type: "string", description: "Une partie du titre ou un mot-clé du bien." },
      },
    },
  },
  {
    name: "rechercher_annonces",
    description: "Recherche des annonces PUBLIÉES par critères. Renvoie plusieurs biens (présente-les tous).",
    parameters: {
      type: "object",
      properties: {
        type_offre: { type: "string", enum: ["location", "vente", "cession", "residence_meublee"] },
        categorie: { type: "string", enum: ["maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre"] },
        categories: { type: "array", items: { type: "string", enum: ["maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre"] } },
        commune: { type: "string" }, quartier: { type: "string" },
        prix_min: { type: "number" }, prix_max: { type: "number" }, chambres_min: { type: "number" },
        tri: { type: "string", enum: ["recent", "prix_asc", "prix_desc"] },
      },
    },
  },
  { name: "lister_zones", description: "Liste les communes et quartiers couverts.", parameters: { type: "object", properties: {} } },
]

async function exec(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "trouver_annonce") return trouverAnnonce(args as { numero?: string; titre?: string })
  if (name === "rechercher_annonces") return rechercherAnnonces(args as SearchArgs)
  if (name === "lister_zones") return listerZones()
  return { erreur: "Outil inconnu." }
}

/**
 * Prompt effectif = règles du code (outils + confidentialité + brièveté, qui
 * PRIMENT toujours) + consignes/base de connaissances de l'agent WhatsApp actif
 * configuré dans Admin → Agents IA. Table absente → défaut code uniquement.
 */
async function effectiveSystem(): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("ai_agents")
      .select("system_prompt, base_connaissance")
      .contains("canaux", ["whatsapp"]).eq("actif", true)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()
    const a = data as { system_prompt: string | null; base_connaissance: string | null } | null
    if (!a) return SYSTEM
    const extra: string[] = []
    if (a.system_prompt?.trim()) extra.push(`CONSIGNES DE L'ADMIN (à respecter dans les limites des règles ci-dessus) :\n${a.system_prompt.trim()}`)
    if (a.base_connaissance?.trim()) extra.push(`BASE DE CONNAISSANCES :\n${a.base_connaissance.trim()}`)
    return extra.length ? `${SYSTEM}\n\n${extra.join("\n\n")}` : SYSTEM
  } catch {
    return SYSTEM
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret")
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  let history: ChatTurn[]
  try {
    const body = await req.json()
    history = (Array.isArray(body?.messages) ? body.messages : [])
      .slice(-12).filter((m: ChatTurn) => m.text?.trim()).map((m: ChatTurn) => ({ ...m, text: m.text.slice(0, 1500) }))
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }
  if (history.length === 0) return NextResponse.json({ ok: true, reply: "Bonjour 👋 Comment puis-je vous aider à trouver un bien à Bouaké ?" })

  const res = await runAssistant({ system: await effectiveSystem(), history, tools: TOOLS, exec })
  return NextResponse.json(res.ok ? { ok: true, reply: res.reply } : { ok: false, error: res.error })
}
