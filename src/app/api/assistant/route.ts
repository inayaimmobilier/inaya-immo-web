import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { runAssistant, type ToolSpec, type ChatTurn } from "@/lib/llm"

// ============================================================================
// Assistant client Inaya : un LLM (modèle choisi par l'admin) avec accès en
// lecture seule à la base via des "tools". Il répond aux questions, propose des
// annonces RÉELLES publiées et fait des suggestions. Les coordonnées des
// propriétaires ne sont jamais exposées : la mise en relation passe par la fiche.
// ============================================================================

const SYSTEM = `Tu es l'assistant virtuel d'Inaya Immo, plateforme immobilière en Côte d'Ivoire (Bouaké, Yamoussoukro et autres communes).
Tu aides les clients à trouver un bien (location, vente, cession, terrain), à répondre à leurs questions et à leur suggérer des annonces adaptées à leur budget, leur commune et leurs critères.

COLLECTE DES CRITÈRES (avant de proposer des biens) — TRÈS IMPORTANT :
- Avant de rechercher, cerne l'ESSENTIEL du besoin. S'il manque des critères, pose des questions COURTES — une seule question par message (deux au maximum si elles vont ensemble), JAMAIS une longue liste. Reste bref, chaleureux, naturel.
- Critères à connaître : (1) le type d'opération : LOUER, ACHETER/vente, ou RÉSIDENCE MEUBLÉE (court séjour) ; (2) le type de bien : studio, 2/3 pièces, villa, terrain, local commercial… ; (3) la COMMUNE ; (4) le QUARTIER souhaité ; (5) le BUDGET — le LOYER mensuel pour une location, le PRIX d'achat pour une vente ; (6) s'il souhaite un bien disponible immédiatement (« prêt à emménager »).
- N'exige PAS tout : dès que tu as de quoi chercher utilement (au minimum le type d'opération + la commune OU le budget), lance "rechercher_annonces", puis affine avec le client au fil de l'échange.
- Si le client a DÉJÀ donné ces infos dans son message, ne les redemande PAS : recherche directement.
- Exemple de première relance (courte) : « Avec plaisir ! Vous cherchez à louer ou à acheter, et dans quelle commune ? »

RÈGLES IMPÉRATIVES :
- Pour proposer des biens, utilise TOUJOURS l'outil "rechercher_annonces". Ne JAMAIS inventer une annonce, un prix, une surface ou un quartier.
- Présente chaque bien sous forme de lien markdown : [{titre} — {prix_texte} · {localisation}]({url}), en utilisant EXACTEMENT les champs "prix_texte" et "localisation" renvoyés par l'outil.
- N'écris JAMAIS le mot « null », ni un prix de « 0 FCFA ». Si "prix_texte" vaut "Prix sur demande", écris « Prix sur demande ». Ne déduis jamais un prix toi-même.
- COHÉRENCE : ne dis pas « aucun bien trouvé » si tu listes ensuite des biens. Si l'outil renvoie des résultats, présente-les comme des propositions. Ne propose un bien que s'il figure réellement dans les résultats de l'outil.
- PRIX & TRI : ne conclus JAMAIS sur « le moins cher / le plus cher » sans avoir appelé "rechercher_annonces" avec tri="prix_asc" (moins cher) ou tri="prix_desc" (plus cher). L'outil ne renvoie que 6 biens à la fois : sans le bon tri, tu ne vois pas les vrais minimums/maximums. Le 1er résultat avec tri="prix_asc" est le bien le moins cher correspondant.
- En Côte d'Ivoire, « X chambres salon » = X+1 pièces (le salon compte comme une pièce). Une demande de « 3 pièces » correspond donc à « 2 chambres salon ». Tiens-en compte avant de conclure qu'un bien ne correspond pas.
- « MAISON » AU SENS LARGE : en CI, « maison » ou « logement » désigne familièrement TOUT bien d'habitation — studio, appartement, maison, villa, immeuble (2 pièces, 3 pièces, 4 pièces ou plus…). Quand un client cherche « une maison » sans préciser, NE restreins PAS à categorie="maison" : passe categories=["maison","appartement","studio"] et affine avec le budget et le nombre de pièces/chambres. Ne te limites à une seule catégorie que si le client le précise (ex: « une villa », « un studio uniquement », « un appartement »).
- PETITS COMMERCES = « LOCAL COMMERCIAL » : il n'existe PAS de catégorie dédiée par métier. Toute demande de cave, salon de coiffure, quincaillerie, salle de jeux, kiosque, maquis, lavage auto, pressing, restaurant, gargote/garbadrome, boulangerie, garage, point mobile money (Orange Money, Wave, MTN Money…), boutique, cyber café, bar, ou plus généralement tout petit commerce/fonds de commerce à céder ou à louer, relève de categorie="local_commercial". NE réponds JAMAIS « nous n'avons pas cette catégorie » pour ces demandes : recherche directement avec categorie="local_commercial" (affine avec le quartier/budget), le nom du commerce (cave, maquis…) figure généralement dans le titre ou la description du bien.
- RÉSIDENCES MEUBLÉES (distinction importante) : ce sont des logements MEUBLÉS loués en court/moyen séjour, facturés par NUIT/semaine/mois — un univers À PART des annonces classiques (location longue durée, vente, cession). Quand le client demande une « résidence meublée », un « meublé », un logement « pour quelques nuits / un court séjour / une réservation », appelle l'outil avec type_offre="residence_meublee" (et NE le mélange PAS avec les locations classiques). À l'inverse, une demande de location/vente classique ne renvoie PAS de résidences meublées (l'outil les exclut automatiquement). Les résidences renvoyées sont meublées (meuble=true) et leur prix est « par nuit » : présente-les ainsi et invite à « Réserver » (et non « Demander une visite »).
- Ne révèle JAMAIS le contact du propriétaire/annonceur. La mise en relation se fait via le bouton « Demander une visite » (annonces) ou « Réserver » (résidences meublées) sur la fiche du bien.
- Si l'outil ne renvoie réellement aucun résultat, dis-le franchement et propose d'élargir les critères (ou "lister_zones" pour les communes/quartiers couverts).
- Réponds en français, de façon concise, chaleureuse et professionnelle. Montants en FCFA.`

const TOOLS: ToolSpec[] = [
  {
    name: "rechercher_annonces",
    description: "Recherche des annonces PUBLIÉES selon des critères. Renvoie au plus 6 biens.",
    parameters: {
      type: "object",
      properties: {
        type_offre: { type: "string", enum: ["location", "vente", "cession", "residence_meublee"], description: "Utilise 'residence_meublee' pour les résidences/appartements meublés en court séjour (tarif par nuit/semaine)." },
        categorie: { type: "string", enum: ["maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre"], description: "Catégorie unique et précise. Pour une demande générique de logement, préfère 'categories'." },
        categories: {
          type: "array",
          items: { type: "string", enum: ["maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre"] },
          description: "Plusieurs catégories à la fois. Pour une demande générique de « maison » / « logement », utilise ['maison','appartement','studio'].",
        },
        commune: { type: "string", description: "Ville / commune, ex: Bouaké" },
        quartier: { type: "string" },
        prix_min: { type: "number" },
        prix_max: { type: "number" },
        chambres_min: { type: "number" },
        tri: {
          type: "string",
          enum: ["recent", "prix_asc", "prix_desc"],
          description: "Ordre des résultats. 'prix_asc' pour les moins chers, 'prix_desc' pour les plus chers, 'recent' (défaut) pour les plus récents.",
        },
      },
    },
  },
  {
    name: "lister_zones",
    description: "Liste les communes et leurs quartiers couverts par la plateforme.",
    parameters: { type: "object", properties: {} },
  },
]

type Args = {
  type_offre?: string; categorie?: string; categories?: string[]; commune?: string; quartier?: string
  prix_min?: number; prix_max?: number; chambres_min?: number
  tri?: "recent" | "prix_asc" | "prix_desc"
}

async function rechercherAnnonces(args: Args): Promise<unknown> {
  const admin = createAdminClient()
  const wantResidence = args.type_offre === "residence_meublee"
  let q = admin
    .from("properties")
    .select("*")
    .eq("statut", "publie")
    .limit(6)

  if (wantResidence) {
    // Résidences meublées uniquement (court/moyen séjour, meublées par définition).
    q = q.eq("type_offre", "residence_meublee")
  } else if (args.type_offre) {
    q = q.eq("type_offre", args.type_offre)
  } else {
    // Recherche classique : on exclut les résidences (elles ont leur propre univers).
    q = q.neq("type_offre", "residence_meublee")
  }

  if (args.categories?.length) q = q.in("categorie", args.categories)
  else if (args.categorie) q = q.eq("categorie", args.categorie)
  if (args.commune) q = q.ilike("ville", `%${args.commune}%`)
  if (args.quartier) q = q.ilike("quartier", `%${args.quartier}%`)
  if (typeof args.prix_min === "number") q = q.gte("prix", args.prix_min)
  if (typeof args.prix_max === "number") q = q.lte("prix", args.prix_max)
  if (typeof args.chambres_min === "number") q = q.gte("nb_chambres", args.chambres_min)

  // Tri : par prix (croissant/décroissant) ou par date. Pour « le moins cher »,
  // on exclut les biens à prix 0/inconnu qui fausseraient le classement.
  if (args.tri === "prix_asc") q = q.gt("prix", 0).order("prix", { ascending: true })
  else if (args.tri === "prix_desc") q = q.order("prix", { ascending: false })
  else q = q.order("created_at", { ascending: false })

  const { data, error } = await q
  if (error) return { erreur: "Recherche indisponible pour le moment." }

  // On pré-formate chaque bien pour éviter que le modèle ne recopie des valeurs
  // brutes (quartier "null", prix "0"). Il doit utiliser prix_texte et localisation tels quels.
  type Row = {
    id: string; titre: string; type_offre: string; categorie: string
    prix: number | null; prix_m2: number | null; surface: number | null
    nb_pieces: number | null; nb_chambres: number | null; quartier: string | null; ville: string | null
    meuble: boolean | null; tarif_periode: string | null
  }
  const fmt = (n: number) => n.toLocaleString("fr-FR")
  const PERIODE: Record<string, string> = { nuit: "/nuit", semaine: "/semaine", mois: "/mois" }
  const rows = (data ?? []) as Row[]
  return {
    nombre: rows.length,
    resultats: rows.map(p => {
      const isResid = p.type_offre === "residence_meublee"
      const localisation = [p.quartier, p.ville].filter(Boolean).join(", ") || "Localisation non précisée"
      let prix_texte: string
      if (p.categorie === "terrain" && p.prix_m2) {
        prix_texte = `${fmt(p.prix_m2)} FCFA/m²${p.prix ? ` (${fmt(p.prix)} FCFA)` : ""}`
      } else if (p.prix && p.prix > 0) {
        const suffixe = isResid ? (PERIODE[p.tarif_periode ?? "nuit"] ?? "/nuit") : (p.type_offre === "location" ? "/mois" : "")
        prix_texte = `${fmt(p.prix)} FCFA${suffixe}`
      } else {
        prix_texte = "Prix sur demande"
      }
      return {
        url: `/biens/${p.id}`,
        titre: p.titre,
        type_offre: p.type_offre,
        type_libelle: isResid ? "Résidence meublée" : p.type_offre,
        categorie: p.categorie,
        meuble: isResid ? true : !!p.meuble,
        prix_texte,
        localisation,
        nb_pieces: p.nb_pieces,
        nb_chambres: p.nb_chambres,
        surface: p.surface,
      }
    }),
  }
}

async function listerZones(): Promise<unknown> {
  const admin = createAdminClient()
  const [{ data: villes }, { data: quartiers }] = await Promise.all([
    admin.from("villes").select("id,nom").eq("actif", true).order("ordre"),
    admin.from("quartiers").select("ville_id,nom").eq("actif", true).order("ordre"),
  ])
  const vById = new Map<string, string>()
  for (const v of (villes ?? []) as { id: string; nom: string }[]) vById.set(v.id, v.nom)
  const byCommune: Record<string, string[]> = {}
  for (const q of (quartiers ?? []) as { ville_id: string; nom: string }[]) {
    const c = vById.get(q.ville_id)
    if (!c) continue
    ;(byCommune[c] ??= []).push(q.nom)
  }
  return { communes: byCommune }
}

async function exec(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "rechercher_annonces") return rechercherAnnonces(args as Args)
  if (name === "lister_zones") return listerZones()
  return { erreur: "Outil inconnu." }
}

export async function POST(req: NextRequest) {
  let incoming: ChatTurn[]
  try {
    const body = await req.json()
    incoming = Array.isArray(body?.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 })
  }

  // Borne l'historique pour limiter le coût.
  const history = incoming.slice(-12).filter(m => m.text?.trim())
  if (history.length === 0) return NextResponse.json({ reply: "Posez-moi votre question 🙂" })

  const res = await runAssistant({ system: SYSTEM, history, tools: TOOLS, exec })
  return NextResponse.json({ reply: res.ok ? res.reply : res.error })
}
