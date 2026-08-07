// ============================================================================
// LIRE UNE TABLE EN ENTIER, MALGRÉ LE PLAFOND POSTGREST.
//
// PostgREST ne renvoie jamais plus de 1 000 lignes par réponse, et `.limit()`
// ne lève PAS cette borne : un `.limit(5000)` rend mille lignes en silence.
// Le code s'en accommodait en filtrant en mémoire ce qu'il avait reçu — donc
// en ne cherchant que dans les annonces les plus récentes. Sur 5 229 annonces
// publiées, quatre sur cinq étaient hors d'atteinte.
//
// La seule issue est `range`, page par page. Les enchaîner coûterait une
// demi-seconde par page ; on lit donc la PREMIÈRE page en demandant le
// décompte exact, ce qui dit combien de pages restent, puis on les demande
// TOUTES EN PARALLÈLE. Le temps total devient celui de deux allers-retours au
// lieu de six.
// ============================================================================

/** Ce qu'on attend d'un constructeur de requête : de quoi poser une plage. */
interface Plageable<T> {
  range(de: number, a: number): PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>
}

export interface OptionsLecture {
  /** Taille d'une page. 1 000 est le maximum servi par PostgREST. */
  pas?: number
  /**
   * Nombre maximal de lignes lues. Garde-fou : si un filtre casse un jour et
   * que la requête devient énorme, mieux vaut un résultat tronqué qu'une page
   * qui ne répond jamais.
   */
  plafond?: number
}

/**
 * Lit toutes les lignes correspondant à une requête.
 *
 * `construire` doit rendre une requête NEUVE à chaque appel : ré-`await` un
 * même objet après avoir changé sa plage est une source d'erreurs silencieuses.
 * La requête doit porter un tri TOTAL (une colonne unique en dernier critère) —
 * sans quoi deux lignes ex æquo peuvent apparaître deux fois, ou disparaître,
 * à la frontière entre deux pages.
 */
export async function lireTout<T>(
  construire: () => Plageable<T>,
  { pas = 1000, plafond = 20_000 }: OptionsLecture = {},
): Promise<{ lignes: T[]; error: unknown }> {
  const premiere = await construire().range(0, pas - 1)
  if (premiere.error) return { lignes: [], error: premiere.error }

  const debut = (premiere.data ?? []) as T[]
  // Moins d'une page pleine : il n'y a rien d'autre à demander.
  if (debut.length < pas) return { lignes: debut, error: null }

  // `count` n'est présent que si l'appelant l'a demandé (`{ count: "exact" }`).
  // Sans lui, on ne sait pas combien de pages restent : on retombe sur un
  // enchaînement page par page, plus lent mais correct.
  const total = typeof premiere.count === "number" ? Math.min(premiere.count, plafond) : null

  if (total == null) {
    const lignes = [...debut]
    for (let de = pas; de < plafond; de += pas) {
      const r = await construire().range(de, de + pas - 1)
      if (r.error) return { lignes, error: r.error }
      const lot = (r.data ?? []) as T[]
      lignes.push(...lot)
      if (lot.length < pas) break
    }
    return { lignes, error: null }
  }

  const plages: [number, number][] = []
  for (let de = pas; de < total; de += pas) plages.push([de, Math.min(de + pas, total) - 1])

  const reponses = await Promise.all(plages.map(([a, b]) => construire().range(a, b)))
  const lignes = [...debut]
  for (const r of reponses) {
    if (r.error) return { lignes, error: r.error }
    lignes.push(...((r.data ?? []) as T[]))
  }
  return { lignes, error: null }
}
