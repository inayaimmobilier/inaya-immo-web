import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, refus } from "@/lib/admin-mobile"

// ============================================================================
// LISTE DES ANNONCES POUR LA MODÉRATION MOBILE.
//
// Mêmes possibilités que le back-office : filtre par statut, et recherche par
// numéro d'annonce, texte, mais aussi par PROVENANCE — numéro du publieur, nom
// du groupe, nom du publieur, extrait du message d'origine. C'est ainsi qu'on
// retrouve sur le terrain une annonce aperçue dans WhatsApp.
//
// La page est volontairement courte (20) : on la consulte au téléphone, souvent
// en 3G, et la liste complète coûterait cher en données — la leçon du quota
// Supabase dépassé le 09/09/2026.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 20
const COLONNES = "id,reference,titre,type_offre,categorie,statut,prix,quartier,ville,created_at,source"

/** Identifiants d'annonces retrouvés par leur provenance WhatsApp. */
async function parProvenance(admin: ReturnType<typeof createAdminClient>, q: string): Promise<string[]> {
  const brut = q.trim()
  if (brut.length < 3) return []
  const motif = `%${brut.replace(/[%_,()]/g, " ").trim()}%`
  const chiffres = brut.replace(/\D/g, "")
  const requetes = [
    admin.from("property_publishers").select("property_id").ilike("group_nom", motif).limit(200),
    admin.from("property_publishers").select("property_id").ilike("contact_nom", motif).limit(200),
    admin.from("whatsapp_messages").select("property_id").ilike("contenu", motif)
      .not("property_id", "is", null).order("recu_le", { ascending: false }).limit(60),
  ]
  // Les numéros sont rangés en chiffres seuls, souvent à l'ancien format
  // (225 + 8 chiffres) : on compare les 8 derniers.
  if (chiffres.length >= 8) {
    requetes.push(admin.from("property_publishers").select("property_id")
      .ilike("contact_phone", `%${chiffres.slice(-8)}%`).limit(200))
  }
  const res = await Promise.all(requetes)
  const ids = new Set<string>()
  for (const r of res) for (const x of (r.data ?? []) as { property_id: string | null }[]) {
    if (x.property_id) ids.add(x.property_id)
  }
  return [...ids]
}

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const statut = p.get("statut") ?? ""
  const q = (p.get("q") ?? "").trim()
  const page = Math.max(1, Number(p.get("page") ?? 1))
  const admin = createAdminClient()

  let lignes: Record<string, unknown>[] = []
  let total = 0

  if (q) {
    // Numéro d'annonce : cherché directement en base, pour qu'une annonce
    // ancienne reste toujours joignable par son numéro.
    const numPart = q.replace(/^n[°o]?\s*|^#\s*/i, "").trim()
    const ref = /^\d+$/.test(numPart) ? Number(numPart) : null

    const [parRef, parTexte, idsProv] = await Promise.all([
      ref != null
        ? admin.from("properties").select(COLONNES).eq("reference", ref).limit(5)
        : Promise.resolve({ data: [] }),
      admin.from("properties").select(COLONNES)
        .or(`titre.ilike.%${q.replace(/[%,()]/g, " ")}%,quartier.ilike.%${q.replace(/[%,()]/g, " ")}%`)
        .order("created_at", { ascending: false }).limit(200),
      parProvenance(admin, q),
    ])

    let provRows: Record<string, unknown>[] = []
    if (idsProv.length) {
      for (let i = 0; i < idsProv.length && provRows.length < 200; i += 100) {
        const { data } = await admin.from("properties").select(COLONNES).in("id", idsProv.slice(i, i + 100))
        provRows.push(...((data ?? []) as Record<string, unknown>[]))
      }
      provRows = provRows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }

    const vues = new Set<string>()
    const fusion: Record<string, unknown>[] = []
    for (const lot of [(parRef.data ?? []) as Record<string, unknown>[], (parTexte.data ?? []) as Record<string, unknown>[], provRows]) {
      for (const r of lot) {
        const id = String(r.id)
        if (vues.has(id)) continue
        if (statut && r.statut !== statut) continue
        vues.add(id); fusion.push(r)
      }
    }
    total = fusion.length
    lignes = fusion.slice((page - 1) * PAR_PAGE, page * PAR_PAGE)
  } else {
    let compte = admin.from("properties").select("id", { count: "exact", head: true })
    let data = admin.from("properties").select(COLONNES)
      .order("created_at", { ascending: false })
      .range((page - 1) * PAR_PAGE, page * PAR_PAGE - 1)
    if (statut) { compte = compte.eq("statut", statut); data = data.eq("statut", statut) }
    const [c, d] = await Promise.all([compte, data])
    total = c.count ?? 0
    lignes = (d.data ?? []) as Record<string, unknown>[]
  }

  // Couvertures : une seule requête pour la page affichée.
  const ids = lignes.map(r => String(r.id))
  const couverture = new Map<string, string>()
  if (ids.length) {
    const { data: m } = await admin.from("property_media")
      .select("property_id,url,type,ordre,thumbnail_url").in("property_id", ids).order("ordre")
    for (const x of (m ?? []) as { property_id: string; url: string; type: string; thumbnail_url: string | null }[]) {
      if (couverture.has(x.property_id)) continue
      const u = x.type === "image" ? x.url : x.thumbnail_url
      if (u) couverture.set(x.property_id, u)
    }
  }

  return NextResponse.json({
    annonces: lignes.map(r => ({ ...r, cover: couverture.get(String(r.id)) ?? null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAR_PAGE)),
  })
}
