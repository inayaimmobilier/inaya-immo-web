import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// RÉSIDENCES MEUBLÉES — le parc et ses réservations.
//
// Une résidence se loue à la nuit : ce qui compte au téléphone, c'est de savoir
// laquelle est libre, et de répondre aux demandes en attente de confirmation.
// Les réservations en attente passent donc AVANT le catalogue.
//
// `disponible` vaut `true` par défaut : la colonne a été ajoutée après coup, et
// un `null` signifie « jamais réglé », pas « indisponible ».
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLONNES =
  "id,reference,titre,description,prix,tarif_periode,statut,disponible,quartier,ville,nb_chambres,forfaits,created_at"

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const admin = createAdminClient()

  const [{ data: residences }, { data: resa }] = await Promise.all([
    admin.from("properties").select(COLONNES)
      .eq("type_offre", "residence_meublee").order("created_at", { ascending: false }),
    admin.from("leads")
      .select("id,statut,contact_nom,contact_telephone,message,creneaux,sejour_nuits,montant_estime,validation_proprietaire,created_at,properties!inner(id,titre,type_offre)")
      .eq("properties.type_offre", "residence_meublee")
      .order("created_at", { ascending: false }).limit(60),
  ])

  const lignes = (residences ?? []) as {
    id: string; reference: number | null; titre: string; description: string | null
    prix: number | null; tarif_periode: string | null; statut: string; disponible: boolean | null
    quartier: string | null; ville: string | null; nb_chambres: number | null
    forfaits: string | null; created_at: string
  }[]

  // Couvertures : une requête pour tout le parc (il reste petit).
  const ids = lignes.map(r => r.id)
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

  type Resa = {
    id: string; statut: string; contact_nom: string | null; contact_telephone: string | null
    message: string | null; creneaux: string | null; sejour_nuits: number | null
    montant_estime: number | null; validation_proprietaire: string | null; created_at: string
    properties: { id: string; titre: string } | null
  }
  const reservations = (resa ?? []) as unknown as Resa[]

  return NextResponse.json({
    residences: lignes.map(r => ({
      ...r,
      disponible: r.disponible !== false,
      cover: couverture.get(r.id) ?? null,
    })),
    reservations: reservations.map(r => ({
      id: r.id, statut: r.statut,
      contact_nom: r.contact_nom, contact_telephone: r.contact_telephone,
      message: r.message, creneaux: r.creneaux,
      nuits: r.sejour_nuits, montant: r.montant_estime,
      validation: r.validation_proprietaire ?? "en_attente",
      created_at: r.created_at,
      residence: r.properties ? { id: r.properties.id, titre: r.properties.titre } : null,
    })),
    resume: {
      total: lignes.length,
      disponibles: lignes.filter(r => r.disponible !== false && r.statut === "publie").length,
      enAttente: reservations.filter(r => (r.validation_proprietaire ?? "en_attente") === "en_attente").length,
    },
    droits: { modifier: peut(staff.role, "moderer") },
  })
}

/** Rend une résidence disponible ou non. */
export async function PATCH(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  let corps: { id?: string; disponible?: boolean }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (!corps.id || typeof corps.disponible !== "boolean") {
    return NextResponse.json({ error: "id_et_disponible_requis" }, { status: 400 })
  }

  const { error } = await createAdminClient().from("properties")
    .update({ disponible: corps.disponible } as never).eq("id", corps.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, disponible: corps.disponible })
}
