// ============================================================================
// AFFICHAGE D'UNE ADRESSE — la commune d'abord, le quartier ensuite.
//
// « Centre », « Commerce », « Koko » : seuls, ces noms de quartiers ne disent
// pas où se trouve le bien. Plusieurs communes ont d'ailleurs des quartiers
// homonymes (Dar Es Salam existe dans sept communes). On écrit donc toujours
// « Bouaké · Gnankoukro 2 Plateaux ».
// ============================================================================

/** Ce qu'il faut pour situer un bien ; toutes les valeurs sont facultatives. */
export type LieuAnnonce = {
  ville?: string | null
  quartier?: string | null
  zones?: { nom?: string | null } | null
}

/**
 * Adresse lisible : « Commune · Quartier », ou la seule commune quand le
 * quartier est inconnu — jamais le quartier seul.
 */
export function lieuAffiche(p: LieuAnnonce): string {
  const ville = p.ville?.trim() || "Bouaké"
  const quartier = p.quartier?.trim() || p.zones?.nom?.trim() || ""
  // Un quartier qui répète la commune n'apporte rien (« Bouaké · Bouaké »).
  if (!quartier || quartier.toLowerCase() === ville.toLowerCase()) return ville
  return `${ville} · ${quartier}`
}
