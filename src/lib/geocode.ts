// ============================================================================
// Géocodage au niveau du QUARTIER (OpenStreetMap / Nominatim).
//
// Choix assumé : on ne géocode JAMAIS une adresse exacte. D'une part elle n'est
// pas dans les annonces, d'autre part la plateforme protège délibérément la
// localisation précise du bien. Un point au centre du quartier dit « c'est dans
// ce secteur » — c'est vrai, utile pour une carte, et sans risque d'envoyer
// quelqu'un devant la mauvaise porte.
//
// Le répertoire des quartiers est mis en cache dans app_settings : Nominatim
// impose une requête par seconde, on n'interroge donc chaque quartier qu'une
// fois, jamais à l'affichage d'une page.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

const CLE = "quartier_coords"
const UA = "InayaImmo/1.0 (https://www.inaya.ci)"

export interface Coord { lat: number; lon: number }
export type Gazetteer = Record<string, Coord | null>   // « quartier|ville » → coordonnées

export async function loadGazetteer(): Promise<Gazetteer> {
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", CLE).maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    return v && typeof v === "object" ? (v as Gazetteer) : {}
  } catch { return {} }
}

async function saveGazetteer(g: Gazetteer): Promise<void> {
  try {
    await createAdminClient().from("app_settings")
      .upsert({ key: CLE, value: g } as never, { onConflict: "key" })
  } catch (e) { console.error("INAYA-GEO-SAVE", e) }
}

/** Une interrogation Nominatim. `null` = introuvable (mémorisé pour ne pas réessayer sans fin). */
async function chercher(quartier: string, ville: string): Promise<Coord | null> {
  const q = `${quartier}, ${ville}, Côte d'Ivoire`
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { "user-agent": UA, "accept-language": "fr" } },
    )
    if (!r.ok) return null
    const j = (await r.json()) as { lat: string; lon: string }[]
    if (!j?.length) return null
    const lat = Number(j[0].lat), lon = Number(j[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    // Garde-fou : la Côte d'Ivoire tient dans cette fenêtre. Au-delà, c'est une
    // homonymie (un « Belleville » parisien, par exemple) — on refuse.
    if (lat < 4 || lat > 11 || lon < -9 || lon > -2) return null
    return { lat, lon }
  } catch { return null }
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Complète le répertoire pour les quartiers demandés. Respecte la limite d'une
 * requête par seconde imposée par Nominatim.
 */
export async function geocodeQuartiers(
  paires: { quartier: string; ville: string }[],
  maxNouveaux = 40,
): Promise<{ gazetteer: Gazetteer; nouveaux: number }> {
  const g = await loadGazetteer()
  let nouveaux = 0
  for (const { quartier, ville } of paires) {
    if (nouveaux >= maxNouveaux) break
    const cle = `${quartier}|${ville}`
    if (cle in g) continue
    g[cle] = await chercher(quartier, ville)
    nouveaux++
    await pause(1100)
  }
  if (nouveaux > 0) await saveGazetteer(g)
  return { gazetteer: g, nouveaux }
}

export const coordDe = (g: Gazetteer, quartier: string | null, ville: string | null): Coord | null =>
  (quartier && ville ? g[`${quartier}|${ville}`] ?? null : null)
