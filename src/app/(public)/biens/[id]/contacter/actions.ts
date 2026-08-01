"use server"

import { createLead } from "../actions"
import { createAlertFromContact } from "@/lib/alert-from-contact"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Un contact via WhatsApp/appel devient un LEAD dans le flux normal :
 * réutilise createLead (insertion + notification staff → assignation à un agent).
 *
 * Et, si le visiteur l'accepte, une ALERTE : c'est le seul moment où l'on sait
 * précisément ce qu'il cherche sans avoir à le lui demander.
 */
export async function createContactLead(input: {
  propertyId: string; nom: string; telephone: string; message?: string
  /** Créer aussi une alerte sur des biens similaires. */
  alerte?: boolean
}): Promise<Result> {
  const fd = new FormData()
  fd.set("property_id", input.propertyId)
  fd.set("contact_nom", input.nom)
  fd.set("contact_telephone", input.telephone)
  if (input.message) fd.set("message", `[Contact WhatsApp] ${input.message}`)
  const res = await createLead(fd)

  if (input.alerte) {
    // Best-effort : une alerte qui échoue ne doit pas invalider la mise en relation.
    await createAlertFromContact({
      propertyId: input.propertyId, nom: input.nom, telephone: input.telephone,
    }).catch(() => ({ ok: false }))
  }
  return res
}
