import { createAdminClient } from "@/lib/supabase/server"
import type { Vocabulaire } from "@/lib/demande-completude"

// ============================================================================
// VOCABULAIRE DES LIEUX, appris de la BASE.
//
// Aucune liste de quartiers n'est codée en dur : le parc évolue, et une liste
// figée vieillirait sans que personne ne s'en aperçoive. On apprend donc des
// annonces déjà publiées quel quartier appartient à quelle commune.
//
// Le point délicat est l'AMBIGUÏTÉ. Mesuré sur le parc : 246 quartiers connus,
// dont 17 présents dans PLUSIEURS communes — « Kami » compte 5 biens à Bouaké
// et 5 à Yamoussoukro, « Kokrenou » existe dans les deux. Pour ceux-là, deviner
// produirait exactement l'erreur qu'on cherche à éliminer : proposer un bien de
// Yamoussoukro à quelqu'un qui cherche à Bouaké. Ils sont donc déclarés
// ambigus, et la demande part en validation humaine.
// ============================================================================

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

/** Le parc bouge lentement ; relire à chaque annonce publiée serait du gaspillage. */
const DUREE_CACHE_MS = 10 * 60_000
let cache: { valeur: Vocabulaire; expire: number } | null = null

export async function chargerVocabulaireLieux(): Promise<Vocabulaire> {
  if (cache && cache.expire > Date.now()) return cache.valeur

  const vide: Vocabulaire = {
    communes: [], communeParQuartier: {}, quartiersAmbigus: new Set(),
  }

  try {
    const db = createAdminClient()
    const lignes: { quartier: string | null; ville: string | null }[] = []

    // PAGINATION OBLIGATOIRE : PostgREST plafonne à 1000 lignes et `limit` ne
    // relève pas ce plafond. Sans `order` + `range`, on obtiendrait mille lignes
    // arbitraires et le vocabulaire serait incomplet — donc des communes
    // « inconnues » pour des quartiers pourtant présents en base.
    const PAS = 1000
    for (let debut = 0; debut < 20_000; debut += PAS) {
      const { data, error } = await db.from("properties")
        .select("quartier,ville")
        .order("created_at", { ascending: false })
        .range(debut, debut + PAS - 1)
      if (error) { console.error("INAYA-VOCAB-001", error.message); break }
      const lot = (data ?? []) as typeof lignes
      lignes.push(...lot)
      if (lot.length < PAS) break
    }

    const parQuartier = new Map<string, Set<string>>()
    const communes = new Set<string>()
    for (const l of lignes) {
      const q = sansAccents(l.quartier ?? "")
      const v = (l.ville ?? "").trim()
      if (!v) continue
      communes.add(v)
      if (!q) continue
      if (!parQuartier.has(q)) parQuartier.set(q, new Set())
      parQuartier.get(q)!.add(v)
    }

    const communeParQuartier: Record<string, string> = {}
    const quartiersAmbigus = new Set<string>()
    for (const [q, villes] of parQuartier) {
      if (villes.size === 1) communeParQuartier[q] = [...villes][0]
      else quartiersAmbigus.add(q)
    }

    const valeur: Vocabulaire = {
      communes: [...communes],
      communeParQuartier,
      quartiersAmbigus,
    }
    cache = { valeur, expire: Date.now() + DUREE_CACHE_MS }
    return valeur
  } catch (e) {
    console.error("INAYA-VOCAB-002", e)
    // Vocabulaire vide : la commune ne pourra pas être déduite, les demandes
    // partiront en validation. Prudent par construction — on ne se met jamais à
    // alerter davantage parce qu'une lecture a échoué.
    return vide
  }
}
