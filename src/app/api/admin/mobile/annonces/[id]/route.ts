import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, masquerNumeros, refus } from "@/lib/admin-mobile"

// ============================================================================
// FICHE COMPLÈTE D'UNE ANNONCE POUR LA MODÉRATION MOBILE.
//
// Tout ce qu'il faut pour trancher sans ouvrir un ordinateur : les données,
// les photos, et surtout la PROVENANCE — qui a publié, dans quel groupe, à
// quelle heure, et le texte exactement tel qu'il a été publié.
//
// Les numéros sont masqués pour les agents et modérateurs, comme sur le site :
// le texte brut d'origine les contient presque toujours.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data: propData } = await admin.from("properties").select("*").eq("id", id).maybeSingle()
  const prop = propData as Record<string, unknown> | null
  if (!prop) return NextResponse.json({ error: "introuvable" }, { status: 404 })

  const [{ data: medias }, { data: pubs }, { data: sig }] = await Promise.all([
    admin.from("property_media").select("id,type,url,thumbnail_url,ordre").eq("property_id", id).order("ordre"),
    admin.from("property_publishers")
      .select("id,rang,est_original,canal,contact_nom,contact_phone,group_nom,publie_le,whatsapp_message_id")
      .eq("property_id", id).order("rang"),
    admin.from("signalements").select("id,categorie,motif,created_at").eq("property_id", id).eq("statut", "nouveau"),
  ])

  const publieurs = (pubs ?? []) as {
    id: string; rang: number; est_original: boolean; canal: string
    contact_nom: string | null; contact_phone: string | null
    group_nom: string | null; publie_le: string; whatsapp_message_id: string | null
  }[]

  // Messages d'origine : le texte publié dans le groupe, celui qu'on recherche
  // dans WhatsApp pour retrouver l'annonce.
  const idsMsg = [...new Set(publieurs.map(p => p.whatsapp_message_id).filter((x): x is string => !!x))]
  const messages = new Map<string, { contenu: string | null; recu_le: string; sender_name: string | null }>()
  if (idsMsg.length) {
    const { data } = await admin.from("whatsapp_messages")
      .select("id,contenu,recu_le,sender_name").in("id", idsMsg)
    for (const m of (data ?? []) as { id: string; contenu: string | null; recu_le: string; sender_name: string | null }[]) {
      messages.set(m.id, m)
    }
  }

  const voitNumeros = peut(staff.role, "numeros")
  const filtre = (t: string | null | undefined) => t ? (voitNumeros ? t : masquerNumeros(t)) : null

  return NextResponse.json({
    annonce: prop,
    medias: medias ?? [],
    signalements: sig ?? [],
    publieurs: publieurs.map(p => {
      const m = p.whatsapp_message_id ? messages.get(p.whatsapp_message_id) : undefined
      return {
        id: p.id, rang: p.rang, est_original: p.est_original, canal: p.canal,
        nom: p.contact_nom, groupe: p.group_nom,
        telephone: voitNumeros ? p.contact_phone : null,
        publie_le: m?.recu_le ?? p.publie_le,
        nom_whatsapp: m?.sender_name ?? null,
        texte_origine: filtre(m?.contenu),
      }
    }),
    droits: { moderer: peut(staff.role, "moderer"), supprimer: peut(staff.role, "supprimer"), numeros: voitNumeros },
  })
}

// ============================================================================
// MODIFICATION D'UNE ANNONCE.
//
// Possible AVANT comme APRÈS validation : une annonce publiée avec un prix ou
// un quartier faux doit pouvoir être rectifiée sans être dépubliée, sinon on
// perd sa visibilité le temps de la corriger.
//
// Seuls les champs envoyés sont touchés — l'application n'envoie que ce que
// l'administrateur a réellement modifié.
// ============================================================================

/** Champs modifiables, avec leur conversion. Tout le reste est ignoré. */
const CHAMPS: Record<string, (v: unknown) => unknown> = {
  titre: v => String(v).trim().slice(0, 200),
  description: v => (String(v).trim() || null),
  type_offre: v => String(v),
  categorie: v => String(v),
  prix: v => (v === null || v === "" ? null : Number(v)),
  prix_m2: v => (v === null || v === "" ? null : Number(v)),
  surface: v => (v === null || v === "" ? null : Number(v)),
  nb_pieces: v => (v === null || v === "" ? null : Number(v)),
  nb_chambres: v => (v === null || v === "" ? null : Number(v)),
  nb_sdb: v => (v === null || v === "" ? null : Number(v)),
  quartier: v => (String(v).trim() || null),
  ville: v => String(v).trim(),
  meuble: v => Boolean(v),
  mois_caution: v => (v === null || v === "" ? null : Number(v)),
  mois_avance: v => (v === null || v === "" ? null : Number(v)),
  mois_agence: v => (v === null || v === "" ? null : Number(v)),
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  let corps: Record<string, unknown>
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  for (const [cle, convertir] of Object.entries(CHAMPS)) {
    if (cle in corps) patch[cle] = convertir(corps[cle])
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "rien_a_modifier" }, { status: 400 })

  // Un titre vide ou un prix négatif passeraient sans bruit : on refuse.
  if ("titre" in patch && !String(patch.titre).trim()) {
    return NextResponse.json({ error: "Le titre ne peut pas être vide." }, { status: 400 })
  }
  for (const n of ["prix", "surface", "nb_pieces", "nb_chambres"]) {
    const v = patch[n]
    if (typeof v === "number" && (Number.isNaN(v) || v < 0)) {
      return NextResponse.json({ error: `Valeur invalide pour ${n}.` }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("properties").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // La recherche garde le catalogue une minute en mémoire : sans cela, la
  // correction resterait invisible sur le site pendant ce laps de temps.
  try {
    const { invaliderCatalogue } = await import("@/lib/property-search")
    invaliderCatalogue()
  } catch { /* sans conséquence */ }

  const { data } = await admin.from("properties").select("*").eq("id", id).maybeSingle()
  return NextResponse.json({ ok: true, annonce: data, champs: Object.keys(patch) })
}
