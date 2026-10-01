// ============================================================================
// SUIVI DES DEMANDES (leads) — ce que l'application admin et les tâches
// planifiées partagent : historique des échanges, doublons, visites.
//
// Tout est « best-effort » face à la migration 069 : sans la table
// `lead_evenements` ou les colonnes `visite_le` / `visite_rappel_le`, les
// appels échouent en silence (42P01 / 42703 / PGRST204) au lieu de casser.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

type Db = ReturnType<typeof createAdminClient>
const ABSENT = new Set(["42P01", "42703", "PGRST204", "PGRST205"])

export type TypeEvenement =
  | "appel" | "whatsapp" | "sms" | "etape" | "note" | "attribution" | "visite" | "doublon" | "archivage"

/** Inscrit un événement dans l'historique d'un lead. Ne lève jamais. */
export async function journaliser(
  db: Db, leadId: string,
  e: { type: TypeEvenement; auteurId?: string | null; cible?: "demandeur" | "proprietaire" | null; detail?: string | null },
): Promise<void> {
  const { error } = await db.from("lead_evenements").insert({
    lead_id: leadId, auteur_id: e.auteurId ?? null, type: e.type, cible: e.cible ?? null, detail: e.detail ?? null,
  } as never)
  if (error && !ABSENT.has(error.code ?? "")) console.error("INAYA-LEAD-EVT", error.message)
}

/** Les 8 derniers chiffres : « 0707266827 », « +225 07 07 26 68 27 » → même personne. */
export const finNumero = (tel: string | null | undefined) => (tel ?? "").replace(/\D/g, "").slice(-8)

/**
 * DOUBLON : même personne, même bien, dans les dernières 24 h. Un client qui
 * touche trois fois « Envoyer » ne doit ni créer trois dossiers, ni recevoir
 * trois accusés de réception, ni déclencher trois alertes au staff.
 */
export async function leadRecent(db: Db, propertyId: string, telephone: string): Promise<{ id: string; message: string | null } | null> {
  const fin = finNumero(telephone)
  if (fin.length < 8) return null
  const depuis = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data } = await db.from("leads").select("id,message,contact_telephone")
    .eq("property_id", propertyId).gte("created_at", depuis)
    .ilike("contact_telephone", `%${fin.slice(-4)}%`)
    .order("created_at", { ascending: true }).limit(10)
  const l = ((data ?? []) as { id: string; message: string | null; contact_telephone: string | null }[])
    .find(x => finNumero(x.contact_telephone) === fin)
  return l ? { id: l.id, message: l.message } : null
}

/** Numéros à joindre côté bien : propriétaire saisi, puis annonceur d'origine. */
export async function telephonesProprietaire(db: Db, propertyId: string): Promise<string[]> {
  const [{ data: p }, { data: pubs }] = await Promise.all([
    db.from("properties").select("proprietaire_telephone").eq("id", propertyId).maybeSingle(),
    db.from("property_publishers").select("contact_phone,est_original").eq("property_id", propertyId).order("rang").limit(3),
  ])
  const tels = [
    (p as { proprietaire_telephone: string | null } | null)?.proprietaire_telephone ?? null,
    ...((pubs ?? []) as { contact_phone: string | null; est_original: boolean | null }[])
      .filter(x => x.est_original).map(x => x.contact_phone),
  ].filter((t): t is string => !!t && finNumero(t).length === 8)
  return [...new Map(tels.map(t => [finNumero(t), t])).values()].slice(0, 1)
}

/** « mardi 7 octobre à 10 h 00 » (heure d'Abidjan = UTC). */
export function dateVisite(iso: string): string {
  const d = new Date(iso)
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
  const h = d.getUTCHours(), m = d.getUTCMinutes()
  return `${jour} à ${h} h ${String(m).padStart(2, "0")}`
}
