// ============================================================================
// Transformer un CONTACT en ALERTE.
//
// Constat : 683 recherches de clients ont été enregistrées en 30 jours, toutes
// par WhatsApp, tandis que le site ne comptait qu'un seul compte. Les gens
// acceptent volontiers de dire ce qu'ils cherchent — mais on ne le leur
// demandait jamais au bon moment.
//
// Le bon moment, c'est juste après avoir laissé son numéro pour une annonce :
// on sait alors exactement ce que la personne cherche, sans lui poser une seule
// question de plus. On dérive donc les critères du bien consulté (même type
// d'offre, même quartier, budget élargi autour du prix) et le moteur de
// correspondance déjà en place fait le reste.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

/** Fourchette de prix autour du bien regardé : −30 % / +30 %, arrondie. */
function fourchette(prix: number | null): { min: number | null; max: number | null } {
  if (!prix || prix <= 0) return { min: null, max: null }
  const arrondi = (n: number) => Math.round(n / 1000) * 1000
  return { min: arrondi(prix * 0.7), max: arrondi(prix * 1.3) }
}

/**
 * Crée une alerte à partir du bien consulté. Ne crée jamais de doublon : si ce
 * numéro a déjà une alerte active sur le même type d'offre, on n'en ajoute pas.
 * Best-effort — ne doit jamais faire échouer la prise de contact.
 */
export async function createAlertFromContact(input: {
  propertyId: string; nom: string; telephone: string
}): Promise<{ ok: boolean; id?: string }> {
  try {
    const admin = createAdminClient()
    const tel = input.telephone.replace(/[^\d+]/g, "")
    if (tel.replace(/\D/g, "").length < 8) return { ok: false }

    const { data: propData } = await admin.from("properties")
      .select("type_offre, categorie, prix, ville, quartier, nb_chambres")
      .eq("id", input.propertyId).maybeSingle()
    const p = propData as {
      type_offre: string; categorie: string; prix: number | null
      ville: string | null; quartier: string | null; nb_chambres: number | null
    } | null
    if (!p) return { ok: false }

    // Doublon : même numéro, même type d'offre, alerte encore active.
    const { data: deja } = await admin.from("search_requests")
      .select("id").eq("contact_telephone", tel).eq("type_offre", p.type_offre)
      .eq("statut", "active").limit(1)
    if ((deja ?? []).length > 0) return { ok: true, id: (deja as { id: string }[])[0].id }

    const { min, max } = fourchette(p.prix)
    const zones = [p.quartier, p.ville].filter(Boolean) as string[]

    const row: Record<string, unknown> = {
      contact_nom: input.nom.trim() || null,
      contact_telephone: tel,
      canal: "web",
      type_offre: p.type_offre,
      categories: p.categorie ? [p.categorie] : null,
      budget_min: min, budget_max: max,
      zones: zones.length ? zones : null,
      nb_pieces_min: p.nb_chambres ?? null,
      description_libre: "Alerte créée automatiquement après une prise de contact sur une annonce similaire.",
      statut: "active",
    }

    let { data, error } = await admin.from("search_requests").insert(row as never).select("id").maybeSingle()
    if (error?.code === "42703") {
      // Colonnes récentes absentes → insertion minimale, l'alerte reste utile.
      const retry = await admin.from("search_requests").insert({
        contact_telephone: tel, canal: "web", type_offre: p.type_offre,
        budget_max: max, zones: row.zones, statut: "active",
      } as never).select("id").maybeSingle()
      data = retry.data; error = retry.error
    }
    if (error) { console.error("INAYA-ALERTE-CONTACT", error.message); return { ok: false } }
    return { ok: true, id: (data as { id: string } | null)?.id }
  } catch (e) {
    console.error("INAYA-ALERTE-CONTACT-2", e)
    return { ok: false }
  }
}
