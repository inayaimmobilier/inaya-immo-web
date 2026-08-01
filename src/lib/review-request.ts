// ============================================================================
// Demande d'AVIS après une affaire conclue.
//
// La page /temoignages et son formulaire existent depuis longtemps, mais deux
// avis seulement y figurent : personne n'en demande jamais. Or le seul bon
// moment pour le faire, c'est juste après une affaire conclue — le client vient
// d'obtenir son logement, et c'est le même WhatsApp qui a servi à la mise en
// relation qui sert à lui demander un mot.
//
// Best-effort : ne doit jamais faire échouer le changement de statut du lead.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"
import { notifyPhone } from "@/lib/notifications"
import { absoluteUrl } from "@/lib/site"

/**
 * Envoie au client la demande d'avis liée à un lead conclu.
 * Renvoie false si le lead n'a pas de numéro exploitable.
 */
export async function requestReviewForLead(leadId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("leads")
      .select("contact_nom, contact_telephone, client_id, property_id, properties(titre)")
      .eq("id", leadId).maybeSingle()
    const lead = data as {
      contact_nom: string | null; contact_telephone: string | null
      client_id: string | null
      properties: { titre: string } | { titre: string }[] | null
    } | null
    if (!lead) return false

    const tel = (lead.contact_telephone ?? "").trim()
    if (tel.replace(/\D/g, "").length < 8) return false

    const prop = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
    const prenom = (lead.contact_nom ?? "").trim().split(/\s+/)[0] || "Bonjour"
    const bien = prop?.titre ? ` pour « ${prop.titre} »` : ""

    // Par le numéro, et non par le compte : la quasi-totalité des demandes sont
    // anonymes (`client_id` vide), et `notifyUser` n'écrit rien sans compte.
    await notifyPhone({
      telephone: tel,
      type: "demande_avis",
      titre: "Inaya Immo — un mot sur votre expérience ?",
      contenu:
        `${prenom}, nous sommes heureux que tout se soit conclu${bien}.\n\n` +
        "Votre avis aide les prochaines familles à nous faire confiance — " +
        `deux lignes suffisent : ${absoluteUrl("/temoignages")}\n\nMerci !`,
    })
    return true
  } catch (e) {
    console.error("INAYA-AVIS-DEMANDE", e)
    return false
  }
}
