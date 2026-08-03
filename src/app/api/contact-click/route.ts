// ============================================================================
// Enregistrement d'une PRISE DE CONTACT sur une annonce (WhatsApp / appel).
// Endpoint et non server action : le visiteur quitte la page pour WhatsApp dans
// la foulée, et seul `sendBeacon` survit à cette navigation.
// Best-effort absolu — ce suivi ne doit jamais retarder ni empêcher le contact.
//
// ── LE CLIC DEVIENT UN LEAD ─────────────────────────────────────────────────
//
// Mesure sur les clics réels : 9 prises de contact, UNE seule ayant renseigné
// nom et téléphone, et `lead_id` renseigné ZÉRO fois. Autrement dit, la quasi
// totalité des prospects ouvraient WhatsApp sans laisser la moindre trace
// exploitable : absents du suivi, aucun agent assigné, aucune relance.
//
// On crée donc le lead DÈS LE CLIC, sans rien demander de plus au visiteur.
// Il est anonyme tant que la personne n'a rien saisi — mais un prospect anonyme
// rattaché à un bien et à une heure vaut infiniment mieux qu'un prospect perdu :
// l'agent sait quel bien a intéressé, et retrouve la conversation WhatsApp
// correspondante par l'horodatage.
// ============================================================================
import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { propertyId, canal, vid, avecContact } = (await req.json()) as {
      propertyId?: string; canal?: string; vid?: string; avecContact?: boolean
    }
    if (!propertyId || !UUID.test(propertyId)) return NextResponse.json({ ok: true })

    const voie: "appel" | "whatsapp" = canal === "appel" ? "appel" : "whatsapp"
    const visiteur = vid ? String(vid).slice(0, 64) : null
    const admin = createAdminClient()

    const { data: clic } = await admin.from("contact_clicks").insert({
      property_id: propertyId,
      canal: voie,
      visitor_id: visiteur,
      avec_contact: avecContact === true,
    } as never).select("id").maybeSingle()

    // `avecContact` = le visiteur vient de remplir la fenêtre de contact, et
    // `createContactLead` a déjà créé un lead complet. En créer un second ici
    // ferait deux fiches pour une seule personne — exactement le doublon qu'on
    // vient d'éliminer ailleurs.
    if (avecContact === true) return NextResponse.json({ ok: true })

    await rattacherLead(admin, {
      propertyId, voie, visiteur,
      clicId: (clic as { id: string } | null)?.id ?? null,
    })
    return NextResponse.json({ ok: true })
  } catch {
    // Table absente (migration 052 non appliquée) ou corps invalide → on ignore.
    return NextResponse.json({ ok: true })
  }
}

async function rattacherLead(
  admin: ReturnType<typeof createAdminClient>,
  a: { propertyId: string; voie: "appel" | "whatsapp"; visiteur: string | null; clicId: string | null },
) {
  try {
    // MÊME VISITEUR, MÊME BIEN : on réutilise le lead existant. Sans cela,
    // revenir trois fois sur une annonce créerait trois fiches pour une seule
    // personne, et un agent la rappellerait trois fois.
    if (a.visiteur) {
      const { data: precedent } = await admin.from("contact_clicks")
        .select("lead_id")
        .eq("visitor_id", a.visiteur)
        .eq("property_id", a.propertyId)
        .not("lead_id", "is", null)
        .limit(1)
        .maybeSingle()
      const dejaLa = (precedent as { lead_id: string | null } | null)?.lead_id
      if (dejaLa) {
        if (a.clicId) await admin.from("contact_clicks")
          .update({ lead_id: dejaLa } as never).eq("id", a.clicId)
        return
      }
    }

    // Visiteur connecté : on connaît son nom et son numéro, le lead est
    // immédiatement exploitable. `sendBeacon` transmet les cookies de même
    // origine, la session est donc lisible ici.
    let nom: string | null = null
    let tel: string | null = null
    let clientId: string | null = null
    try {
      const { data: { user } } = await (await createClient()).auth.getUser()
      if (user) {
        clientId = user.id
        const { data: p } = await admin.from("profiles")
          .select("nom, telephone").eq("id", user.id).maybeSingle()
        const prof = p as { nom: string | null; telephone: string | null } | null
        nom = prof?.nom ?? null
        tel = prof?.telephone ?? null
      }
    } catch { /* visiteur anonyme : c'est le cas normal */ }

    const { data: lead } = await admin.from("leads").insert({
      property_id: a.propertyId,
      client_id: clientId,
      contact_nom: nom,
      contact_telephone: tel,
      // `canal` ne connaît pas « appel » ; on reste exact sur la voie de
      // conversation, et le détail précis va dans le message plutôt que de
      // déformer une valeur de l'énumération.
      canal: a.voie === "whatsapp" ? "whatsapp" : "web",
      message: a.voie === "whatsapp"
        ? "[Contact direct] Bouton WhatsApp — coordonnées non saisies"
        : "[Contact direct] Bouton Appeler — coordonnées non saisies",
      statut: "nouveau",
    } as never).select("id").maybeSingle()

    const leadId = (lead as { id: string } | null)?.id
    if (leadId && a.clicId) {
      await admin.from("contact_clicks").update({ lead_id: leadId } as never).eq("id", a.clicId)
    }
  } catch (e) {
    // Jamais bloquant : le suivi ne doit pas empêcher le contact.
    console.error("INAYA-CLICK-LEAD", e)
  }
}
