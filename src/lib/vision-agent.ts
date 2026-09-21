// ============================================================================
// LIRE UNE FICHE PAPIER PHOTOGRAPHIÉE.
//
// Un agent revient du terrain avec un cahier, une liste griffonnée, une fiche
// remplie à la main. Il la photographie, et les clients entrent dans son
// carnet sans être retapés.
//
// ── LA LEÇON DE CLIENTPRO, APPLIQUÉE D'EMBLÉE ──────────────────────────────
//
// Là-bas, le modèle inventait des noms de téléphones qui n'existaient pas :
// devant une écriture manuscrite ambiguë, il comblait le trou par ce qui lui
// semblait plausible. Ce qui a rendu la lecture utilisable, c'est d'envoyer
// avec la photo la LISTE DE RÉFÉRENCE, puis de rapprocher la réponse de cette
// liste au retour.
//
// Ici la liste de référence, ce sont les communes et les quartiers réels,
// tenus par l'administration (`villes` / `quartiers`). « Belvil », « Bel
// Ville », « belleville » retombent sur « Belleville ».
//
// ── CE QU'ON N'INVENTE JAMAIS ──────────────────────────────────────────────
//
// Un numéro ivoirien a DIX chiffres et commence par 01, 05, 07, 21, 25 ou 27.
// Devant un chiffre illisible, la consigne est de laisser le champ VIDE. Un
// numéro faux est pire qu'un numéro absent : on écrit à un inconnu, et le
// client, lui, n'est jamais rappelé.
// ============================================================================

import { llmVision, type ImagePourLlm } from "@/lib/llm"
import { createAdminClient } from "@/lib/supabase/server"

export interface ClientLu {
  nom: string
  telephone: string
  telephone_2?: string | null
  quartier?: string | null
  ville?: string | null
  profession?: string | null
  notes?: string | null
  /** Ce que le client cherche, si la fiche le dit. */
  recherche?: string | null
  /** Ce dont on n'est pas sûr, dit à l'agent avant qu'il n'enregistre. */
  doutes: string[]
}

export interface Lecture {
  clients: ClientLu[]
  modele: string
  avertissements: string[]
}

const PREFIXES_CI = ["01", "05", "07", "21", "25", "27"]

export function systeme(lieux: { villes: string[]; quartiers: string[] }): string {
  const l: string[] = []
  l.push("Tu lis des documents photographiés par un agent immobilier en Côte d'Ivoire :")
  l.push("cahiers de clients, listes manuscrites, fiches de renseignements, bons remplis à la main.")
  l.push("Tu en extrais les CLIENTS — des personnes à recontacter — et rien d'autre.")
  l.push("")
  l.push("RÈGLE ABSOLUE : tu ne DEVINES jamais. Un champ que tu ne lis pas avec certitude")
  l.push("reste vide, et tu l'expliques dans « doutes ». Une donnée inventée coûte plus cher")
  l.push("qu'une donnée manquante : on écrit alors à un inconnu, et le vrai client n'est")
  l.push("jamais rappelé.")
  l.push("")
  l.push("LES NUMÉROS DE TÉLÉPHONE :")
  l.push("- un numéro ivoirien a EXACTEMENT DIX chiffres ;")
  l.push(`- il commence par ${PREFIXES_CI.join(", ")} ;`)
  l.push("- le zéro initial FAIT PARTIE du numéro, ne le retire jamais ;")
  l.push("- si tu comptes neuf ou onze chiffres, c'est que tu as mal lu : laisse le champ")
  l.push("  VIDE et dis-le dans « doutes », plutôt que d'ajouter ou de retirer un chiffre.")
  l.push("")
  l.push("LES NOMS :")
  l.push("- sur les documents ivoiriens, le NOM DE FAMILLE est écrit en premier, souvent en")
  l.push("  majuscules, le prénom ensuite. Garde cet ordre tel quel.")
  l.push("")

  if (lieux.quartiers.length) {
    l.push("LES LIEUX — voici les communes et quartiers qui existent réellement :")
    if (lieux.villes.length) l.push(`Communes : ${lieux.villes.join(", ")}.`)
    l.push(`Quartiers : ${lieux.quartiers.join(", ")}.`)
    l.push("Quand ce que tu lis ressemble à l'un d'eux, réponds avec L'ORTHOGRAPHE EXACTE")
    l.push("de cette liste. Si le lieu lu n'y ressemble à rien, recopie-le tel quel.")
  } else {
    l.push("Aucune liste de quartiers n'est disponible : recopie les lieux tels qu'ils sont écrits.")
  }

  l.push("")
  l.push("RÉPONDS UNIQUEMENT par un tableau JSON, sans texte autour, sans balises de code :")
  l.push('[{"nom":"","telephone":"","telephone_2":null,"quartier":null,"ville":null,')
  l.push('"profession":null,"recherche":null,"notes":null,"doutes":[]}]')
  l.push("Un objet par personne. Si le document ne contient aucun client, réponds [].")
  return l.join("\n")
}

/** Les communes et quartiers tenus par l'administration. */
export async function lieuxConnus(): Promise<{ villes: string[]; quartiers: string[] }> {
  const admin = createAdminClient()
  try {
    const [{ data: v }, { data: q }] = await Promise.all([
      admin.from("villes").select("nom").eq("actif", true).order("ordre").limit(60),
      admin.from("quartiers").select("nom").eq("actif", true).order("ordre").limit(200),
    ])
    return {
      villes: ((v ?? []) as { nom: string }[]).map(x => x.nom),
      quartiers: ((q ?? []) as { nom: string }[]).map(x => x.nom),
    }
  } catch {
    // Les tables peuvent manquer sur un environnement pas à jour : la lecture
    // reste possible, simplement sans rapprochement des lieux.
    return { villes: [], quartiers: [] }
  }
}

// ── Rapprochement ───────────────────────────────────────────────────────────

const aplatir = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "")

/**
 * Ramène un lieu lu sur la liste réelle.
 *
 * Trois passes : identique une fois aplati, puis contenu l'un dans l'autre,
 * puis distance d'édition bornée. La tolérance dépend de la longueur — sur un
 * mot de cinq lettres, deux fautes ne sont plus une faute de lecture mais un
 * autre mot.
 */
export function rapprocher(lu: string, connus: string[]): string | null {
  const net = lu.trim()
  if (!net || !connus.length) return null
  const cible = aplatir(net)
  if (!cible) return null

  for (const c of connus) if (aplatir(c) === cible) return c
  for (const c of connus) {
    const a = aplatir(c)
    if (a.length >= 4 && (a.includes(cible) || cible.includes(a))) return c
  }

  const tolerance = cible.length <= 5 ? 1 : cible.length <= 9 ? 2 : 3
  let meilleur: { nom: string; d: number } | null = null
  for (const c of connus) {
    const d = distance(cible, aplatir(c), tolerance)
    if (d <= tolerance && (!meilleur || d < meilleur.d)) meilleur = { nom: c, d }
  }
  return meilleur?.nom ?? null
}

/** Distance de Levenshtein, abandonnée dès qu'elle dépasse le plafond. */
function distance(a: string, b: string, plafond: number): number {
  if (Math.abs(a.length - b.length) > plafond) return plafond + 1
  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const courante = [i]
    let minimum = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(precedente[j] + 1, courante[j - 1] + 1, precedente[j - 1] + cout)
      courante.push(v)
      if (v < minimum) minimum = v
    }
    if (minimum > plafond) return plafond + 1
    precedente = courante
  }
  return precedente[b.length]
}

/**
 * Dix chiffres et un préfixe réel, ou vide — jamais un à-peu-près.
 *
 * ⚠️ On ne prend PAS « les dix derniers chiffres » d'un nombre trop long.
 * Cette facilité transforme un 07010203045 mal relevé (onze chiffres, donc un
 * chiffre lu en trop) en 7010203045 — un numéro d'apparence correcte, mais
 * qui n'est celui de personne. Seul l'indicatif pays 225 autorise un préfixe
 * devant le numéro ; tout le reste est une erreur de lecture, et se refuse.
 */
export function numeroSur(brut: string | null | undefined): { valeur: string; doute: string | null } {
  const saisi = (brut ?? "").trim()
  let chiffres = saisi.replace(/\D/g, "")
  if (!chiffres) return { valeur: "", doute: null }

  // Préfixe international, sous ses deux écritures.
  if (chiffres.startsWith("00225")) chiffres = chiffres.slice(5)
  else if (chiffres.length > 10 && chiffres.startsWith("225")) chiffres = chiffres.slice(3)

  if (chiffres.length !== 10) {
    return {
      valeur: "",
      doute:
        `numéro à ${chiffres.length} chiffre(s) (« ${saisi} ») : il en faut dix. ` +
        (chiffres.length > 10
          ? "Un chiffre a probablement été lu en trop — à vérifier sur le document."
          : "Un chiffre manque — à vérifier sur le document."),
    }
  }

  if (!PREFIXES_CI.includes(chiffres.slice(0, 2))) {
    return {
      valeur: chiffres,
      doute: `le numéro commence par ${chiffres.slice(0, 2)}, qui n'est pas un préfixe ivoirien courant`,
    }
  }
  return { valeur: chiffres, doute: null }
}

// ── Lecture ─────────────────────────────────────────────────────────────────

export async function lire(images: ImagePourLlm[]): Promise<Lecture | { erreur: string }> {
  const lieux = await lieuxConnus()
  const avertissements: string[] = []
  if (!lieux.quartiers.length) {
    avertissements.push(
      "Aucune liste de quartiers n'a pu être chargée : les lieux seront recopiés tels quels, sans correction.",
    )
  }

  const reponse = await llmVision(
    systeme(lieux),
    images.length > 1
      ? `Voici ${images.length} photos d'un même document ou de pages successives. Extrais tous les clients.`
      : "Voici la photo d'un document. Extrais tous les clients qui s'y trouvent.",
    images,
  )
  if (!reponse.ok) return { erreur: reponse.error }

  const brut = extraireJson(reponse.text)
  if (!brut) {
    return { erreur: "Le modèle n'a pas répondu en JSON exploitable. Reprenez la photo, plus nette et bien à plat." }
  }

  const clients: ClientLu[] = []
  for (const o of brut) {
    const nom = String(o.nom ?? "").trim().replace(/\s+/g, " ")
    if (!nom) continue

    const doutes = Array.isArray(o.doutes) ? o.doutes.map(String).filter(Boolean) : []

    const tel = numeroSur(o.telephone as string)
    if (tel.doute) doutes.push(tel.doute)
    const tel2 = numeroSur(o.telephone_2 as string)
    if (tel2.doute) doutes.push(`second ${tel2.doute}`)

    // Le rapprochement des lieux : c'est lui qui empêche « Belvil » d'entrer
    // au carnet et de n'être jamais retrouvé par une recherche.
    const quartierLu = String(o.quartier ?? "").trim()
    const quartier = quartierLu ? (rapprocher(quartierLu, lieux.quartiers) ?? quartierLu) : null
    if (quartier && quartierLu && aplatir(quartier) !== aplatir(quartierLu)) {
      doutes.push(`quartier lu « ${quartierLu} », rapproché de « ${quartier} »`)
    }

    const villeLue = String(o.ville ?? "").trim()
    const ville = villeLue ? (rapprocher(villeLue, lieux.villes) ?? villeLue) : null

    if (!tel.valeur) doutes.push("aucun numéro exploitable : la fiche ne pourra pas être enregistrée telle quelle")

    clients.push({
      nom,
      telephone: tel.valeur,
      telephone_2: tel2.valeur || null,
      quartier,
      ville,
      profession: vide(o.profession),
      recherche: vide(o.recherche),
      notes: vide(o.notes),
      doutes,
    })
  }

  if (!clients.length) {
    avertissements.push("Aucun client n'a été trouvé sur cette image.")
  }

  return { clients, modele: reponse.modele, avertissements }
}

const vide = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim()
  return s && s.toLowerCase() !== "null" ? s.slice(0, 500) : null
}

/**
 * Extrait le tableau JSON de la réponse.
 *
 * Les modèles enrobent volontiers leur réponse de ```json ou d'une phrase
 * d'introduction, malgré la consigne. On prend le premier tableau complet
 * plutôt que d'échouer sur une politesse.
 */
export function extraireJson(texte: string): Record<string, unknown>[] | null {
  const net = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  const essais = [net]

  const debut = net.indexOf("[")
  const fin = net.lastIndexOf("]")
  if (debut >= 0 && fin > debut) essais.push(net.slice(debut, fin + 1))

  for (const e of essais) {
    try {
      const v = JSON.parse(e)
      if (Array.isArray(v)) return v as Record<string, unknown>[]
      // Un modèle renvoie parfois un objet unique au lieu d'un tableau.
      if (v && typeof v === "object") return [v as Record<string, unknown>]
    } catch { /* on essaie la découpe suivante */ }
  }
  return null
}
