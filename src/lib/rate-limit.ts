// ============================================================================
// Limitation de débit pour les endpoints publics de l'application mobile.
//
// Constat : /auth/login, /auth/forgot et /auth/register n'en avaient aucune.
// Concrètement, on pouvait essayer les mots de passe d'un numéro à l'infini, et
// surtout déclencher autant d'envois d'OTP qu'on voulait sur le téléphone d'un
// tiers — chaque SMS étant facturé.
//
// LIMITE ASSUMÉE : ce compteur vit en mémoire du processus. En serverless, il
// est donc par instance et remis à zéro au démarrage à froid. Ce n'est pas une
// barrière infranchissable ; c'est ce qui transforme une attaque triviale en
// attaque coûteuse, sans table supplémentaire. Une limitation partagée
// (Redis/base) reste préférable si le trafic le justifie.
// ============================================================================

interface Seau { hits: number[] }

const seaux = new Map<string, Seau>()
const MAX_CLES = 5000

function nettoyer(maintenant: number, fenetreMs: number): void {
  if (seaux.size <= MAX_CLES) return
  for (const [cle, s] of seaux) {
    if (s.hits.every(t => maintenant - t >= fenetreMs)) seaux.delete(cle)
  }
}

/**
 * Enregistre une tentative et indique s'il faut la refuser.
 * @param cle     identifiant du compteur (ex. `login:ip:1.2.3.4`)
 * @param max     tentatives autorisées dans la fenêtre
 * @param fenetreMs durée de la fenêtre glissante
 */
export function limiteAtteinte(cle: string, max: number, fenetreMs: number): boolean {
  const maintenant = Date.now()
  const seau = seaux.get(cle) ?? { hits: [] }
  seau.hits = seau.hits.filter(t => maintenant - t < fenetreMs)
  seau.hits.push(maintenant)
  seaux.set(cle, seau)
  nettoyer(maintenant, fenetreMs)
  return seau.hits.length > max
}

/** Adresse de l'appelant, telle que vue derrière le proxy Vercel. */
export function ipDe(req: Request): string {
  const h = req.headers
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "inconnue"
  )
}

/** Normalise un identifiant (téléphone ou e-mail) pour en faire une clé stable. */
export function cleIdentifiant(identifiant: string): string {
  return identifiant.trim().toLowerCase().replace(/[\s.-]/g, "")
}

export const TROP_DE_TENTATIVES =
  "Trop de tentatives. Patientez quelques minutes avant de réessayer."
