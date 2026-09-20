import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// RECHERCHES ET ALERTES — ce que les clients cherchent.
//
// Chaque demande déclenche une alerte quand une annonce correspondante est
// publiée. Encore faut-il qu'elle porte des critères exploitables : une demande
// sans quartier, sans budget et sans nombre de pièces correspond à TOUT ce qui
// se publie, et le client recevrait un message par annonce.
//
// Ces demandes-là ne déclenchent plus rien, mais ce sont de vrais prospects :
// les taire sans le dire reviendrait à les perdre. La vue « à qualifier » les
// rassemble pour qu'on les rappelle et qu'on précise le besoin.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 20

interface Recherche {
  id: string; reference: number | null; contact_nom: string | null; contact_telephone: string | null
  canal: string | null; type_offre: string | null; categories: string[] | null
  budget_min: number | null; budget_max: number | null; zones: string[] | null
  commune: string | null; communes: string[] | null
  surface_min: number | null; nb_pieces_min: number | null; meuble: boolean | null
  description_libre: string | null; statut: string; created_at: string; expire_at: string | null
}

/**
 * La demande porte-t-elle de quoi filtrer ?
 *
 * Un seul critère réel suffit — quartier, budget, nombre de pièces ou surface.
 * Sans aucun, l'alerte se déclencherait sur toutes les annonces.
 */
function estExploitable(r: Recherche): boolean {
  return !!(
    (r.zones?.length) || r.commune || (r.communes?.length) ||
    r.budget_max != null || r.budget_min != null ||
    r.nb_pieces_min != null || r.surface_min != null
  )
}

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const statut = p.get("statut") ?? ""
  const vue = p.get("vue") ?? ""
  const q = (p.get("q") ?? "").trim().toLowerCase()
  const page = Math.max(1, Number(p.get("page") ?? 1))
  const admin = createAdminClient()

  let requete = admin.from("search_requests").select("*")
    .order("created_at", { ascending: false }).limit(500)
  if (statut) requete = requete.eq("statut", statut)

  const { data, error } = await requete
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let lignes = (data ?? []) as Recherche[]
  if (q) {
    lignes = lignes.filter(r =>
      [r.contact_nom, r.contact_telephone, r.description_libre, ...(r.zones ?? [])]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
  }
  if (vue === "a_qualifier") lignes = lignes.filter(r => !estExploitable(r))

  const debut = (page - 1) * PAR_PAGE
  return NextResponse.json({
    recherches: lignes.slice(debut, debut + PAR_PAGE).map(r => ({
      id: r.id, reference: r.reference,
      contact_nom: r.contact_nom, contact_telephone: r.contact_telephone,
      canal: r.canal, statut: r.statut, created_at: r.created_at, expire_at: r.expire_at,
      type_offre: r.type_offre, categories: r.categories ?? [],
      budget_min: r.budget_min, budget_max: r.budget_max,
      zones: r.zones ?? [],
      communes: r.communes ?? (r.commune ? [r.commune] : []),
      nb_pieces_min: r.nb_pieces_min, surface_min: r.surface_min, meuble: r.meuble,
      description_libre: r.description_libre,
      exploitable: estExploitable(r),
    })),
    total: lignes.length,
    aQualifier: (data ?? []).filter(r => !estExploitable(r as Recherche)).length,
    page,
    pages: Math.max(1, Math.ceil(lignes.length / PAR_PAGE)),
    droits: { modifier: peut(staff.role, "moderer") },
  })
}

/** Change le statut d'une demande (active / satisfaite / expiree). */
export async function PATCH(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  let corps: { id?: string; statut?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (!corps.id || !corps.statut) return NextResponse.json({ error: "id_et_statut_requis" }, { status: 400 })
  if (!["active", "satisfaite", "expiree"].includes(corps.statut)) {
    return NextResponse.json({ error: "statut_inconnu" }, { status: 400 })
  }

  const { error } = await createAdminClient().from("search_requests")
    .update({ statut: corps.statut } as never).eq("id", corps.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, statut: corps.statut })
}
