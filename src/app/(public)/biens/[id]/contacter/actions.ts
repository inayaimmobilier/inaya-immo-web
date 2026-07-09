"use server"

import { createLead } from "../actions"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Un contact via WhatsApp/appel devient un LEAD dans le flux normal :
 * réutilise createLead (insertion + notification staff → assignation à un agent).
 */
export async function createContactLead(input: {
  propertyId: string; nom: string; telephone: string; message?: string
}): Promise<Result> {
  const fd = new FormData()
  fd.set("property_id", input.propertyId)
  fd.set("contact_nom", input.nom)
  fd.set("contact_telephone", input.telephone)
  if (input.message) fd.set("message", `[Contact WhatsApp] ${input.message}`)
  return createLead(fd)
}
