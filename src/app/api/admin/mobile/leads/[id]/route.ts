import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// FAIRE AVANCER UNE TÂCHE.
//
// Changer le statut d'un lead, et consigner un compte rendu. Le compte rendu
// n'est pas décoratif : c'est ce qui permet à un collègue de reprendre le
// dossier sans rappeler le client pour lui refaire raconter son histoire.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUTS = [
  "nouveau", "en_traitement", "contacte", "visite_planifiee",
  "visite_effectuee", "paiement_planifie", "conclu", "abandonne",
]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { id } = await ctx.params
  let corps: { statut?: string; compte_rendu?: string }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (corps.statut) {
    if (!STATUTS.includes(corps.statut)) return NextResponse.json({ error: "statut_inconnu" }, { status: 400 })
    patch.statut = corps.statut
    // Un lead qu'on fait avancer est un lead qu'on prend en charge : sans
    // cela, il resterait éternellement « non attribué » dans les listes.
    patch.agent_id = staff.userId
    patch.pris_en_charge_le = new Date().toISOString()
  }
  if (typeof corps.compte_rendu === "string") {
    patch.compte_rendu = corps.compte_rendu.trim().slice(0, 2000) || null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "rien_a_modifier" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("leads").update(patch as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, statut: patch.statut ?? null })
}

// ── FICHE D'UN LEAD — ouverte depuis une notification ou la liste ─────────────
//
// Tout ce qu'il faut pour agir sans changer d'écran : la demande, l'annonce
// visée, et les deux parties à joindre — le demandeur et l'annonceur /
// propriétaire. Le numéro du propriétaire reste réservé aux administrateurs,
// comme partout ailleurs.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const { id } = await ctx.params
  const admin = createAdminClient()
  const { data: lead } = await admin.from("leads")
    .select("id,statut,message,canal,created_at,updated_at,contact_nom,contact_telephone,contact_email,creneaux,compte_rendu,rdv_paiement_le,agent_id,pris_en_charge_le,sejour_nuits,montant_estime,validation_proprietaire,property_id")
    .eq("id", id).maybeSingle()
  if (!lead) return NextResponse.json({ error: "Ce lead n'existe plus." }, { status: 404 })
  const l = lead as Record<string, unknown> & { property_id: string | null; agent_id: string | null }

  const voitNumeros = peut(staff.role, "numeros")
  const [bien, publieurs, media, agent] = await Promise.all([
    l.property_id
      ? admin.from("properties").select("id,reference,titre,statut,type_offre,categorie,prix,quartier,ville,proprietaire_nom,proprietaire_telephone").eq("id", l.property_id).maybeSingle()
      : Promise.resolve({ data: null }),
    l.property_id
      ? admin.from("property_publishers").select("contact_nom,contact_phone,group_nom,est_original,publie_le").eq("property_id", l.property_id).order("rang", { ascending: true }).limit(5)
      : Promise.resolve({ data: [] }),
    l.property_id
      ? admin.from("property_media").select("url,type,thumbnail_url").eq("property_id", l.property_id).order("ordre").limit(1)
      : Promise.resolve({ data: [] }),
    l.agent_id
      ? admin.from("profiles").select("nom,telephone").eq("id", l.agent_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const b = bien.data as (Record<string, unknown> & { proprietaire_nom: string | null; proprietaire_telephone: string | null }) | null
  // Les parties côté bien : le propriétaire saisi, puis les publieurs (annonce
  // venue d'un groupe WhatsApp : c'est l'agence ou le particulier qui a posté).
  const cote: { role: string; nom: string | null; telephone: string | null; groupe?: string | null }[] = []
  if (b?.proprietaire_nom || b?.proprietaire_telephone) {
    cote.push({ role: "Propriétaire", nom: b.proprietaire_nom, telephone: voitNumeros ? b.proprietaire_telephone : null })
  }
  for (const p of (publieurs.data ?? []) as { contact_nom: string | null; contact_phone: string | null; group_nom: string | null; est_original: boolean | null }[]) {
    if (!p.contact_phone && !p.contact_nom) continue
    if (cote.some(c => c.telephone && c.telephone === p.contact_phone)) continue
    cote.push({ role: p.est_original ? "Annonceur" : "Autre publieur", nom: p.contact_nom, telephone: voitNumeros ? p.contact_phone : null, groupe: p.group_nom })
  }
  const m = ((media.data ?? []) as { url: string; type: string; thumbnail_url: string | null }[])[0]

  const { property_id: _pid, agent_id: _aid, ...reste } = l
  return NextResponse.json({
    lead: reste,
    bien: b ? {
      id: b.id, reference: b.reference, titre: b.titre, statut: b.statut, type_offre: b.type_offre,
      categorie: b.categorie, prix: b.prix, quartier: b.quartier, ville: b.ville,
      cover: m ? (m.type === "image" ? m.url : m.thumbnail_url) : null,
    } : null,
    proprietaires: cote,
    agent: agent.data ?? null,
    droits: { numeros: voitNumeros, supprimer: peut(staff.role, "supprimer"), moderer: peut(staff.role, "moderer") },
  })
}

/** Supprime un lead (doublon, test, demande farfelue). Réservé aux administrateurs. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "supprimer")) return refus("acces_refuse")

  const { id } = await ctx.params
  const admin = createAdminClient()
  const { error } = await admin.from("leads").delete().eq("id", id)
  if (error) {
    // Un lead déjà converti en transaction ne se supprime pas : il porte la commission.
    const lie = error.code === "23503"
    return NextResponse.json({ error: lie ? "Ce lead est lié à une transaction : passez-le plutôt en « Abandonné »." : error.message }, { status: lie ? 409 : 500 })
  }
  // Ses notifications n'ont plus d'objet : elles disparaissent avec lui.
  await admin.from("notifications").delete().eq("payload->>lead_id", id)
  return NextResponse.json({ ok: true })
}
