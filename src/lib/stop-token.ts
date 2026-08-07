import { createHmac, timingSafeEqual } from "node:crypto"

// ============================================================================
// JETON D'ARRÊT D'ALERTE — signé.
//
// FAILLE CORRIGÉE : le lien de désabonnement portait le numéro SÉQUENTIEL de la
// recherche (« /a/stop/795 »). Ce numéro figure dans chaque SMS envoyé, et rien
// ne prouvait qu'on était bien le destinataire. Une boucle sur /a/stop/1, /2,
// /3… désactivait donc les alertes de TOUTE la base — des centaines de clients
// coupés en quelques minutes, sans trace, par n'importe qui.
//
// On ajoute une signature courte dérivée d'un secret serveur. Neuf caractères
// de plus dans le SMS, et l'énumération devient impossible : sans le secret, on
// ne peut pas fabriquer la signature d'un numéro voisin.
//
// La signature est TRONQUÉE à 8 caractères hexadécimaux (32 bits). C'est court
// pour de la cryptographie, mais suffisant ici : il faudrait ~2 milliards
// d'essais pour en deviner une seule, et le limiteur de débit coupe bien avant.
// Le compromis se paie en longueur de SMS, qui est facturée.
// ============================================================================

/**
 * Secret de signature. `SUPABASE_SERVICE_ROLE_KEY` par défaut : il est déjà
 * présent partout côté serveur et n'est jamais exposé au navigateur. Un secret
 * dédié reste préférable et prend le dessus s'il est défini.
 */
function secret(): string {
  return process.env.ALERT_STOP_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ""
}

function signature(cible: string, portee = "stop"): string {
  const s = secret()
  if (!s) return ""
  // La PORTÉE entre dans le calcul : sans elle, la signature d'un lien de
  // désabonnement vaudrait pour un lien de tâche portant la même référence.
  return createHmac("sha256", s).update(`${portee}:${cible}`).digest("hex").slice(0, 8)
}

/**
 * Jeton à mettre dans le lien : « 795-3f9a1c04 ».
 * Sans secret configuré, on renvoie la cible nue — le lien continue de
 * fonctionner plutôt que de casser le désabonnement, ce qui exposerait
 * l'agence à des signalements pour spam.
 */
export function jetonStop(cible: string): string {
  const sig = signature(cible)
  return sig ? `${cible}-${sig}` : cible
}

export interface JetonVerifie {
  /** Référence ou UUID, signature retirée. */
  cible: string
  /** La signature est présente ET valide. */
  signe: boolean
}

/**
 * Sépare la cible de sa signature et vérifie celle-ci.
 *
 * Un jeton NON signé reste accepté par l'appelant, mais sous limitation de
 * débit : les SMS déjà partis en contiennent, et un client qui veut se
 * désabonner doit pouvoir le faire. C'est le point d'équilibre entre la
 * fermeture de la faille et le respect du désabonnement.
 */
export function verifierJetonStop(raw: string): JetonVerifie {
  const brut = String(raw ?? "").trim()
  // L'UUID contient des tirets : on ne coupe que sur un suffixe de 8 caractères
  // hexadécimaux précédé d'un tiret, et seulement s'il correspond.
  const m = brut.match(/^(.+)-([0-9a-f]{8})$/i)
  if (!m) return { cible: brut, signe: false }

  const [, cible, fournie] = m
  const attendue = signature(cible)
  if (!attendue) return { cible: brut, signe: false }

  const a = Buffer.from(fournie.toLowerCase())
  const b = Buffer.from(attendue)
  // Comparaison à temps constant : une comparaison naïve laisserait mesurer
  // le nombre de caractères corrects et reconstruire la signature octet par octet.
  const ok = a.length === b.length && timingSafeEqual(a, b)

  // Signature invalide : la cible peut malgré tout être un UUID contenant un
  // segment de 8 caractères hexadécimaux. On rend alors le jeton entier.
  return ok ? { cible, signe: true } : { cible: brut, signe: false }
}


// ============================================================================
// JETON DE TÂCHE AGENT — même mécanique, portée distincte.
//
// FAILLE CORRIGÉE : /t/{ref}, /tc/{ref} et /tr/{ref} agissaient sur la seule
// foi d'une référence de QUATRE caractères hexadécimaux, dérivée des quatre
// premiers caractères de l'UUID du lead. Cela fait 65 536 valeurs possibles,
// et la dérivation est DÉTERMINISTE : quiconque connaît l'identifiant d'un
// lead (il circule déjà dans les liens /rdv/) en déduit la référence sans
// rien chercher. Le reste s'énumère en quelques minutes.
//
// Ce qu'on pouvait faire sans être connecté : abandonner la tâche d'un agent,
// réassigner un lead à n'importe quel agent, et surtout déclarer une affaire
// conclue pour un montant arbitraire — ce qui crée une transaction et calcule
// une commission. Rien de tout cela ne demandait de compte.
//
// La signature ferme l'énumération : sans le secret serveur, on ne fabrique
// pas celle d'une référence voisine. Les liens déjà partis restent valides
// (voir `verifierJetonTache`), car couper les agents de leurs tâches en cours
// pour fermer une faille reviendrait à s'infliger la panne qu'on redoute.
// ============================================================================

/** Jeton à mettre dans l'URL du bouton WhatsApp : « A3F1-9c2e04b7 ». */
export function jetonTache(ref: string): string {
  const sig = signature(ref, "tache")
  return sig ? `${ref}-${sig}` : ref
}

export interface JetonTache {
  /** Référence courte à 4 caractères, telle qu'elle est stockée en base. */
  ref: string
  /** La signature accompagne la référence ET elle est valide. */
  signe: boolean
}

/**
 * Découpe « REF-signature » et vérifie la signature.
 *
 * Un jeton NON signé est rendu avec `signe: false` : c'est à l'appelant de
 * décider. Les pages l'acceptent sous forte limitation de débit — les liens
 * envoyés avant ce correctif n'en portent pas, et un agent ne doit pas se
 * retrouver devant une page morte au milieu d'une prise en charge.
 */
export function verifierJetonTache(raw: string): JetonTache {
  const brut = String(raw ?? "").trim()
  const m = brut.match(/^([a-z0-9]{1,8})-([0-9a-f]{8})$/i)
  const nettoyer = (v: string) => v.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)
  if (!m) return { ref: nettoyer(brut), signe: false }

  const [, ref, fournie] = m
  const attendue = signature(ref.toUpperCase(), "tache")
  if (!attendue) return { ref: nettoyer(ref), signe: false }

  const a = Buffer.from(fournie.toLowerCase())
  const b = Buffer.from(attendue)
  // Comparaison à temps constant : une comparaison naïve laisserait mesurer le
  // nombre de caractères corrects et reconstruire la signature octet par octet.
  const ok = a.length === b.length && timingSafeEqual(a, b)
  return { ref: nettoyer(ref), signe: ok }
}
