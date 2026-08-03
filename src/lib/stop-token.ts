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

function signature(cible: string): string {
  const s = secret()
  if (!s) return ""
  return createHmac("sha256", s).update(`stop:${cible}`).digest("hex").slice(0, 8)
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
