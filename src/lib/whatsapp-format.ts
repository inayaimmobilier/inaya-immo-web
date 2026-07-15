// ============================================================================
// Conversion Markdown standard → formatage WhatsApp.
//
// WhatsApp n'utilise PAS le Markdown standard :
//   gras     = *texte*   (UNE seule étoile, pas **texte**)
//   italique = _texte_
//   barré    = ~texte~
//   mono     = ```texte```
// Or les LLM produisent du Markdown standard par défaut (**gras**, ## titres,
// - puces) → les « ** » et « ## » s'affichaient LITTÉRALEMENT dans WhatsApp
// (ex. « **🏙 Municipal** »), rendant les listes d'annonces illisibles.
//
// On convertit donc systématiquement côté serveur : le prompt seul n'est pas
// fiable (un LLM retombe régulièrement sur ses habitudes Markdown).
// ============================================================================

/** Convertit un texte Markdown standard en formatage WhatsApp natif. */
export function toWhatsAppFormat(input: string): string {
  if (!input) return input
  let s = input

  // 1) Gras Markdown **texte** / __texte__ → *texte* (WhatsApp).
  //    Fait EN PREMIER : toutes les autres règles touchent aux étoiles.
  //    [^\n] : un gras ne traverse jamais une fin de ligne (sinon deux annonces
  //    de lignes différentes seraient collées dans un même gras).
  s = s.replace(/\*\*([^\n]+?)\*\*/g, "*$1*")
  s = s.replace(/__([^\n]+?)__/g, "*$1*")

  // 2) Titres Markdown (« ## Titre », « ### Titre ») → ligne en gras.
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*$/gm, "*$1*")

  // 3) Puces « - » ou « * » en début de ligne → « • ».
  //    Le « \s+ » exige un espace APRÈS le tiret/l'étoile : une ligne qui commence
  //    par du gras (« *N°2441* — … ») n'est donc jamais transformée en puce.
  s = s.replace(/^[ \t]*[-*][ \t]+/gm, "• ")

  // 4) Liens Markdown [texte](url) → « texte : url » (WhatsApp n'affiche pas les liens MD).
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 : $2")

  // 5) Nettoyage : jamais plus de 2 sauts de ligne consécutifs.
  s = s.replace(/\n{3,}/g, "\n\n")

  return s.trim()
}
