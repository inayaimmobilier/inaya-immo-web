import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { runAssistant, type ToolSpec, type ChatTurn } from "@/lib/llm"
import { SITE_URL } from "@/lib/site"
import { toWhatsAppFormat } from "@/lib/whatsapp-format"

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

const SYSTEM = `Tu es *Miss Maryama*, l'assistante WhatsApp d'Inaya Immo (immobilier en Côte d'Ivoire). Ton rôle : CONSEILLER brièvement, MOTIVER, et REDIRIGER vers le site inaya.ci. Réponds en français.

COUVERTURE GÉOGRAPHIQUE — RÈGLE IMPORTANTE : Inaya Immo n'est PAS limité à Bouaké : nous couvrons plusieurs villes de Côte d'Ivoire. Ne SUPPOSE JAMAIS que le client cherche à Bouaké. Ne cite une ville que si LE CLIENT l'a déjà précisée. Ne dis jamais « à Bouaké » de toi-même. Si tu ne connais pas encore la ville, demande simplement « Dans quelle ville/commune cherchez-vous ? » (au besoin, appuie-toi sur "lister_zones").

IDENTITÉ : tu t'appelles Maryama. Quand tu te présentes (premier message, ou si on te demande qui tu es), dis « Miss Maryama, votre conseillère Inaya Immo ». Ne te présente pas à chaque message : une seule fois suffit. Tu es une femme, chaleureuse et professionnelle.

FIL DE LA CONVERSATION — RÈGLE MAJEURE : tu reçois TOUT l'historique. Relis-le avant CHAQUE réponse et tiens compte du dernier message du client.
- Ne redemande JAMAIS une information déjà donnée (ville, quartier, budget, type de bien, nombre de chambres) — même dite plusieurs messages plus haut, même en passant (« un studio à Bouaké », « 40 000 »). Mémorise-la et sers-t'en.
- Ne pose jamais deux fois la même question. Si le client vient de répondre, avance : n'ignore pas sa réponse.
- Ne demande QUE l'information qui manque réellement. Dès que tu as le minimum (type + zone OU budget), LANCE la recherche au lieu de poser une question de plus.
- Les critères s'ACCUMULENT au fil des messages : « un studio » + « à Bouaké » + « 40 000 » = un studio à Bouaké à 40 000 F. Ne repars jamais de zéro.

STYLE — RÈGLE N°1 : messages TRÈS COURTS (2-4 lignes max), chaleureux, allant droit au but. Pas de longs paragraphes. Une seule question à la fois. Termine souvent en invitant à ouvrir le bien sur inaya.ci. (Exception : une liste d'annonces suit le FORMAT DES LISTES ci-dessous.)

FORMATAGE WHATSAPP — IMPÉRATIF : WhatsApp n'utilise PAS le Markdown standard.
- Gras = *texte* avec UNE SEULE étoile. N'écris JAMAIS **texte** (les deux étoiles s'affichent littéralement et rendent le message illisible).
- Italique = _texte_. Pas de titres « # » ni « ## ». Pas de liens [texte](url) : écris l'URL en clair.

FORMAT DES LISTES D'ANNONCES — pour éviter toute confusion entre les biens :
- Maximum 5 annonces par message. S'il y en a plus, donne les 5 plus pertinentes et propose d'affiner (quartier, budget).
- UNE annonce = UN bloc, et les blocs sont séparés par une LIGNE VIDE. Jamais deux annonces sur la même ligne, jamais deux annonces fusionnées.
- Structure exacte de chaque bloc (2 lignes) :
*N°1042* — Chambre salon
💰 50 000 FCFA/mois · 📍 Municipal
🔗 inaya.ci/annonces/1042
- Si tu regroupes par quartier, écris le quartier seul sur sa ligne en gras, puis une ligne vide, puis les blocs.
- Termine par UNE ligne d'invitation (ex. « Ouvre le lien qui t'intéresse et clique sur *Demander une visite* »).

PHOTOS — RÈGLE : tu ne peux PAS envoyer de photos dans la conversation. Les photos, la description complète et le bouton « Demander une visite » sont sur la PAGE de l'annonce. Si un client demande à voir des images/photos/vidéos, ne promets JAMAIS de les envoyer : invite-le à ouvrir le lien de l'annonce, où il verra toutes les photos. Ex. « Toutes les photos sont sur la fiche : ouvre 🔗 inaya.ci/annonces/1042 ».

LIENS NON CLIQUABLES — RÈGLE : sur WhatsApp, les liens envoyés par un numéro qui n'est PAS enregistré dans les contacts du client sont souvent affichés en texte simple, non cliquables.
- La PREMIÈRE fois que tu envoies des liens dans une conversation, ajoute UNE seule ligne à la fin :
📇 Astuce : enregistre ce numéro dans tes contacts (Inaya Immo) — les liens deviendront cliquables.
- Ne répète PAS cette astuce à chaque message : une seule fois par conversation.
- Si le client dit que le lien ne s'ouvre pas / n'est pas cliquable : explique-lui d'enregistrer ce numéro dans ses contacts puis de rouvrir la conversation ; à défaut, qu'il copie le lien et le colle dans son navigateur.

CONFIDENTIALITÉ — RÈGLE ABSOLUE : tu ne donnes JAMAIS le numéro de téléphone du propriétaire/annonceur, ni aucune coordonnée personnelle. La mise en relation est assurée par Inaya : invite le client à ouvrir le lien du bien et à faire une demande via « Contacter / Demander une visite ». Si un client insiste pour avoir le numéro, explique poliment qu'Inaya gère la mise en relation pour sa sécurité, et propose de transmettre sa demande.

OUTILS :
- "trouver_annonce" : retrouve une annonce précise par son NUMÉRO (référence, ex. 1042), par une partie du TITRE, ou un identifiant. Utilise-le dès qu'un client mentionne un numéro d'annonce ou un titre.
- "rechercher_annonces" : recherche par critères (type d'opération, catégorie, commune, quartier, budget, chambres). Utilise-le pour une demande par critères.
- "lister_zones" : communes et quartiers couverts.

RÈGLES :
- Ne JAMAIS inventer un bien, un prix ou un numéro : utilise toujours les outils et ne cite que ce qu'ils renvoient. Les outils ne renvoient PAS de téléphone — n'en invente aucun.
- NUMÉROS ET LIENS — RÈGLE CRITIQUE : le numéro (reference), le titre, le prix et l'url d'un bien viennent TOUJOURS de la MÊME ligne de résultat. Ne mélange JAMAIS le titre d'un bien avec le numéro ou le lien d'un autre. N'utilise JAMAIS un numéro vu plus tôt dans la conversation (une recherche précédente portait sur d'autres biens) : seuls comptent les résultats de la recherche EN COURS. Si tu n'as pas le numéro exact renvoyé par l'outil pour ce bien, ne le cite pas du tout.
- Présente chaque bien clairement : « N°{reference} — {titre} · {prix_texte} · {localisation}. Détails et mise en relation : {url} ».
- Si "prix_texte" = "Prix sur demande", écris-le tel quel (jamais « 0 FCFA »).
- Avant de rechercher par critères, si le besoin est flou, pose UNE question courte (louer/acheter ? quelle commune ? budget ?). Ne fais pas de longue liste de questions.
- « MAISON » EST UN TERME GÉNÉRIQUE : quand un client dit « je cherche une maison », il parle de TOUT logement — villa, appartement, studio, chambre salon, entrée couchée, immeuble, duplex. Ne restreins JAMAIS à la seule catégorie "maison" : passe plusieurs catégories dans "categories" (["maison","appartement","studio"]). Ne demande pas « villa ou appartement ? » si le client a dit « maison » : propose ce qui correspond à son budget et à sa zone.
- NOMENCLATURE « CHAMBRES SALON » (Côte d'Ivoire) — « X chambres salon » = X chambres + 1 salon = X+1 pièces :
  · « chambre salon » (sans chiffre) = 1 chambre + 1 salon = 2 pièces — généralement un appartement ;
  · « 2 chambres salon » = 3 pièces — généralement un appartement ;
  · « 3 chambres salon » = 4 pièces — un appartement ou une villa ;
  · « 4 chambres salon » = 5 pièces — généralement une villa.
  Quand un client demande « 3 chambres salon », cherche donc chambres_min=3 (≈ 4 pièces), et n'écarte ni les appartements ni les villas.
- Petits commerces = catégorie "local_commercial".
- « ENTRÉE COUCHÉE » (jargon ivoirien, s'écrit de multiples façons : « entré couché », « entrer coucher », « entrée-couchée »…) = logement d'UNE SEULE pièce, SANS toilettes ni cuisine dédiées — les sanitaires sont COMMUNS, partagés avec d'autres logements. C'est le logement le plus économique. Pour en chercher, passe l'expression dans "mots_cles" de "rechercher_annonces" (toutes les graphies sont couvertes automatiquement). Si un client demande une entrée couchée, ne lui propose pas un studio équipé sans le préciser : ce n'est pas la même chose (un studio a ses propres toilettes/cuisine).
- Résidences meublées : court séjour, prix par nuit ; univers séparé (type_offre="residence_meublee").
- Si aucun résultat, dis-le franchement et propose d'élargir. Montants en FCFA.`

// Injecté UNIQUEMENT lors de la seconde chance, quand le modèle a cité un numéro
// qui ne provenait d'aucun outil de ce tour.
const NUDGE_OUTIL = `RAPPEL IMPÉRATIF : dans ta dernière réponse tu as cité un numéro d'annonce qui ne provient d'AUCUN résultat d'outil. C'est interdit : un numéro vu plus haut dans la conversation correspond à d'AUTRES biens. Si le client cherche un bien, appelle MAINTENANT "rechercher_annonces" (ou "trouver_annonce") et ne cite que les numéros renvoyés par cet appel. Si tu n'as aucun résultat, dis-le simplement et propose d'élargir — SANS redemander une information que le client a déjà donnée.`

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
  mots_cles?: string
}

// Retire les accents et échappe les caractères cassant la syntaxe .or().
const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
const cleanTerm = (s: string) => s.replace(/[(),]/g, " ").trim()

/**
 * « Entrée couchée » : jargon ivoirien pour un logement d'UNE pièce, sans toilettes
 * ni cuisine dédiées (sanitaires communs). L'expression s'écrit de multiples façons
 * (« entré couché », « entrer coucher », « entrée-couchée », « entree couchee »…),
 * et les annonces issues de WhatsApp reprennent n'importe laquelle. On détecte donc
 * l'expression sur les RADICAUX, une fois les accents retirés.
 */
const ENTREE_COUCHEE_RE = /entr[a-z]*[\s-]*couch/i

/** Motifs ilike pour une recherche plein texte tolérante aux graphies. */
function keywordPatterns(term: string): string[] {
  const plain = stripAccents(term)
  // Radicaux « entr…couch… » : couvre TOUTES les variantes d'« entrée couchée ».
  if (ENTREE_COUCHEE_RE.test(plain)) return ["%entr%couch%"]
  return Array.from(new Set([term, plain])).map(v => `%${v}%`)
}

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
  // Mots-clés libres (ex. « entrée couchée ») cherchés sur titre + description.
  if (args.mots_cles) {
    const term = cleanTerm(args.mots_cles)
    if (term) {
      q = q.or(keywordPatterns(term).flatMap(p => [`titre.ilike.${p}`, `description.ilike.${p}`]).join(","))
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
        mots_cles: { type: "string", description: "Mots-clés cherchés dans le titre/la description (ex. « entrée couchée », « meublé », « ACD »). Toutes les graphies d'« entrée couchée » sont couvertes." },
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

// ── Garde-fou anti-invention ────────────────────────────────────────────────
// Un LLM peut recoller un titre d'annonce à un numéro vu PLUS TÔT dans la
// conversation : le message paraît crédible mais les liens pointent vers de tout
// autres biens (incident constaté : « Chambre salon Nimbo » → N°2712 = terrain à
// Yamoussoukro). Aucune consigne de prompt ne garantit l'absence de ce mélange.
// On VÉRIFIE donc, côté serveur, que chaque numéro cité a réellement été renvoyé
// par un outil DANS CE TOUR ; sinon on remplace la réponse par une liste
// reconstruite à partir des vraies données.

type Presented = ReturnType<typeof present>[number]

/** Numéros d'annonce cités dans un message (« N°1042 » et « …/annonces/1042 »). */
function citedRefs(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/N°\s*(\d{1,7})/gi)) out.add(Number(m[1]))
  for (const m of text.matchAll(/annonces\/(\d{1,7})/gi)) out.add(Number(m[1]))
  return [...out]
}

/** Liste WhatsApp déterministe, construite UNIQUEMENT depuis les résultats réels. */
function buildSafeList(rows: Presented[]): string {
  const blocs = rows.slice(0, 5).map(r => {
    const lieu = r.localisation ? ` · 📍 ${r.localisation}` : ""
    return `*N°${r.reference}* — ${r.titre}\n💰 ${r.prix_texte}${lieu}\n🔗 ${r.url}`
  })
  return [
    blocs.length > 1 ? "Voici ce que j'ai trouvé 👇" : "Voici ce que j'ai trouvé 👇",
    "",
    blocs.join("\n\n"),
    "",
    "Ouvre le lien qui t'intéresse et clique sur *Demander une visite* 😊",
  ].join("\n")
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
  if (history.length === 0) return NextResponse.json({ ok: true, reply: "Bonjour 👋 Je suis *Miss Maryama*, votre conseillère Inaya Immo. Comment puis-je vous aider à trouver votre bien ?" })

  const baseSystem = await effectiveSystem()

  // Un tour complet : on mémorise ce que les outils ont RÉELLEMENT renvoyé, pour
  // pouvoir vérifier ensuite les numéros cités par le modèle.
  const runTour = async (system: string) => {
    const seenRefs = new Set<number>()
    let lastResults: Presented[] = []
    const execTracked = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const out = await exec(name, args)
      const r = out as { resultats?: Presented[] }
      if (Array.isArray(r?.resultats)) {
        lastResults = r.resultats
        for (const x of r.resultats) if (typeof x.reference === "number") seenRefs.add(x.reference)
      }
      return out
    }
    const res = await runAssistant({ system, history, tools: TOOLS, exec: execTracked })
    if (!res.ok) return { ok: false as const, error: res.error }
    // Filet déterministe : le LLM retombe régulièrement sur du Markdown standard.
    const reply = toWhatsAppFormat(res.reply)
    const invented = citedRefs(reply).filter(r => !seenRefs.has(r))
    return { ok: true as const, reply, invented, lastResults }
  }

  let tour = await runTour(baseSystem)
  if (!tour.ok) return NextResponse.json({ ok: false, error: tour.error })

  // Le modèle a cité un numéro qui ne vient d'aucun outil de ce tour (il recopie
  // une annonce vue plus haut). On lui donne UNE seconde chance en exigeant l'appel
  // de l'outil : bien plus utile que de couper la conversation par un message
  // générique — ce qui faisait perdre le fil et reposait la même question en boucle.
  if (tour.invented.length > 0) {
    const retry = await runTour(`${baseSystem}\n\n${NUDGE_OUTIL}`)
    if (retry.ok) tour = retry
  }

  if (tour.ok && tour.invented.length > 0) {
    console.error("INAYA-ASSIST-HALLU numéros inventés (après seconde chance)", { invented: tour.invented })
    // On ne laisse JAMAIS partir un lien qui ne correspond pas au bien annoncé.
    // À défaut de résultats, on propose d'ÉLARGIR — sans redemander ce que le
    // client a déjà dit.
    return NextResponse.json({
      ok: true,
      reply: tour.lastResults.length > 0
        ? buildSafeList(tour.lastResults)
        : "Je n'ai pas trouvé d'annonce correspondant exactement à ce que vous cherchez. Voulez-vous que j'élargisse — un quartier voisin, ou un budget un peu plus haut ?",
    })
  }

  return NextResponse.json({ ok: true, reply: tour.reply })
}
