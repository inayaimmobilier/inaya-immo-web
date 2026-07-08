// Lecture serveur de la liste des types de biens gérée par l'admin.
// Stockée dans app_settings (clé « property_types »). Repli sur la liste par
// défaut si absente ou si la table n'existe pas encore.
import { createAdminClient } from "@/lib/supabase/server"
import { DEFAULT_PROPERTY_TYPES, type PropertyType } from "@/lib/property-types"

export async function getPropertyTypes(): Promise<PropertyType[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("value").eq("key", "property_types").maybeSingle()
    const val = (data as { value?: unknown } | null)?.value
    if (Array.isArray(val)) {
      const list = (val as PropertyType[])
        .filter(t => t && typeof t.code === "string" && t.code.trim() && typeof t.label === "string" && t.label.trim())
      if (list.length) return list
    }
  } catch { /* repli */ }
  return DEFAULT_PROPERTY_TYPES
}
