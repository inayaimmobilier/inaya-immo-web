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
