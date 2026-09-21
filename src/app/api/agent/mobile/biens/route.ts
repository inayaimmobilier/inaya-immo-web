import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"

// ============================================================================
// CHERCHER UN BIEN À PROPOSER.
//
// Le catalogue, vu par l'agent : par numéro d'annonce, par texte, par quartier.
// Aucune colonne de contact n'est sélectionnée — ni ici ni ailleurs dans cette
// API. Un agent qui obtiendrait le numéro du propriétaire pourrait traiter en
// direct, et la commission d'Inaya disparaîtrait avec lui.
//
// Par défaut, seules les annonces DISPONIBLES : proposer un bien déjà loué
// fait perdre le client. Les autres restent atteignables par leur numéro.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 20
const COLONNES = "id,reference,titre,type_offre,categorie,statut,prix,charges,quartier,ville,nb_pieces,nb_chambres,surface,meuble,created_at"

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const q = (p.get("q") ?? "").trim()
  const typeOffre = p.get("type_offre") ?? ""
  const categorie = p.get("categorie") ?? ""
  const prixMax = Number(p.get("prix_max") ?? 0)
  const piecesMin = Number(p.get("pieces_min") ?? 0)
  const tout = p.get("tout") === "1"
  const page = Math.max(1, Number(p.get("page") ?? 1))

  const admin = createAdminClient()

  // Un nombre seul, c'est un numéro d'annonce. L'agent le lit dans WhatsApp et
  // le tape tel quel : cette recherche-là doit aboutir avant toutes les autres.
  const numPart = q.replace(/^n[°o]?\s*|^#\s*/i, "").trim()
  if (/^\d{1,7}$/.test(numPart)) {
    const { data } = await admin.from("properties").select(COLONNES).eq("reference", Number(numPart)).limit(1)
    const trouve = (data ?? []) as Record<string, unknown>[]
    if (trouve.length) {
      return NextResponse.json({ biens: await avecPhoto(admin, trouve), total: 1, page: 1, pages: 1 })
    }
  }

  let req_ = admin.from("properties").select(COLONNES, { count: "exact" })
  if (!tout) req_ = req_.eq("statut", "publie")
  if (typeOffre) req_ = req_.eq("type_offre", typeOffre as never)
  if (categorie) req_ = req_.eq("categorie", categorie as never)
  if (prixMax > 0) req_ = req_.lte("prix", prixMax)
  if (piecesMin > 0) req_ = req_.gte("nb_pieces", piecesMin)
  if (q) {
    const motif = `%${q.replace(/[%,()]/g, " ").trim()}%`
    req_ = req_.or(`titre.ilike.${motif},quartier.ilike.${motif},ville.ilike.${motif}`)
  }

  const debut = (page - 1) * PAR_PAGE
  const { data, count, error } = await req_
    .order("created_at", { ascending: false })
    .range(debut, debut + PAR_PAGE - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    biens: await avecPhoto(admin, (data ?? []) as Record<string, unknown>[]),
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAR_PAGE)),
  })
}

/**
 * Une photo par bien, en une seule requête.
 *
 * Sans image, un agent ne reconnaît pas l'annonce qu'il a vue passer — et sur
 * le terrain, c'est la photo qu'il montre au client.
 */
async function avecPhoto(
  admin: ReturnType<typeof createAdminClient>,
  biens: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (!biens.length) return biens
  const ids = biens.map(b => String(b.id))
  const { data } = await admin.from("property_media")
    .select("property_id,url,thumbnail_url,type,ordre")
    .in("property_id", ids).eq("type", "image").order("ordre")
  const couverture = new Map<string, string>()
  for (const m of (data ?? []) as { property_id: string; url: string; thumbnail_url: string | null }[]) {
    if (!couverture.has(m.property_id)) couverture.set(m.property_id, m.thumbnail_url || m.url)
  }
  return biens.map(b => ({ ...b, cover: couverture.get(String(b.id)) ?? null }))
}
