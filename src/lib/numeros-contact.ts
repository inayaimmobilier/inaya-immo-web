import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import type { NumeroContact } from "@/lib/numeros-contact-format"

export type { NumeroContact } from "@/lib/numeros-contact-format"

/**
 * Numéros de contact ACTIFS, dans l'ordre choisi par l'admin. Mis en cache
 * 5 min (étiquette « numeros-contact », vidée à l'enregistrement) : ils
 * s'affichent sur presque toutes les pages, une lecture en base par page
 * coûterait pour rien. Sans liste configurée : repli sur le contact support.
 */
export const lireNumerosContact = unstable_cache(
  async (): Promise<NumeroContact[]> => {
    try {
      const { data } = await createAdminClient().from("app_settings")
        .select("key,value").in("key", ["numeros_contact", "contact_support"])
      const lignes = (data ?? []) as { key: string; value: unknown }[]
      const liste = lignes.find(l => l.key === "numeros_contact")?.value
      if (Array.isArray(liste)) {
        return (liste as NumeroContact[]).filter(n => n && n.actif !== false && n.numero?.replace(/\D/g, "").length >= 8)
      }
      const support = lignes.find(l => l.key === "contact_support")?.value
      return typeof support === "string" && support.replace(/\D/g, "").length >= 8
        ? [{ numero: support, libelle: "Service client", whatsapp: true, actif: true }]
        : []
    } catch {
      return []
    }
  },
  ["numeros-contact"],
  { revalidate: 300, tags: ["numeros-contact"] },
)
