// ============================================================================
// Session d'un compte Facebook dédié, collée par un administrateur.
//
// Trois formats acceptés, ceux que produisent les outils d'export courants :
//  - JSON (extension « Cookie-Editor » → Export → JSON) : [{ name, value, domain }]
//  - fichier Netscape (« Get cookies.txt ») : lignes séparées par des tabulations
//  - en-tête brut : « c_user=…; xs=…; datr=… »
// Tous sont ramenés à un en-tête Cookie ne gardant que les cookies de
// facebook.com. `c_user` (identifiant du compte) et `xs` (jeton de session)
// sont indispensables : sans eux, Facebook sert la page d'un visiteur.
// ============================================================================

export type SessionLue =
  | { ok: true; entete: string; cUser: string; nombre: number }
  | { ok: false; erreur: string }

const estFacebook = (domaine: string | undefined) => !domaine || /(^|\.)facebook\.com$/i.test(domaine.replace(/^\./, ""))

export function lireSession(brut: string): SessionLue {
  const texte = (brut ?? "").trim()
  if (!texte) return { ok: false, erreur: "Collez la session (cookies) du compte." }
  const cookies = new Map<string, string>()

  if (texte.startsWith("[") || texte.startsWith("{")) {
    try {
      const j = JSON.parse(texte) as unknown
      const liste = (Array.isArray(j) ? j : (j as { cookies?: unknown[] }).cookies ?? []) as
        { name?: string; value?: string; domain?: string }[]
      for (const c of liste) if (c?.name && typeof c.value === "string" && estFacebook(c.domain)) cookies.set(c.name, c.value)
    } catch { return { ok: false, erreur: "Le JSON collé est invalide." } }
  } else if (texte.includes("\t")) {
    for (const ligne of texte.split(/\r?\n/)) {
      if (!ligne.trim() || (ligne.startsWith("#") && !ligne.startsWith("#HttpOnly_"))) continue
      const col = ligne.replace(/^#HttpOnly_/, "").split("\t")
      if (col.length >= 7 && estFacebook(col[0])) cookies.set(col[5], col[6].trim())
    }
  } else {
    for (const part of texte.replace(/^cookie:\s*/i, "").split(";")) {
      const i = part.indexOf("=")
      if (i > 0) cookies.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
    }
  }

  const cUser = cookies.get("c_user")
  if (!cUser || !cookies.get("xs")) {
    return { ok: false, erreur: "Session incomplète : les cookies « c_user » et « xs » sont introuvables. Exportez les cookies APRÈS vous être connecté au compte, depuis facebook.com." }
  }
  const entete = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
  return { ok: true, entete, cUser, nombre: cookies.size }
}

/** Identifiant affichable d'une session, sans rien en dévoiler d'utile. */
export function resumeSession(entete: string): string {
  const cUser = entete.match(/(?:^|;\s*)c_user=(\d+)/)?.[1]
  return cUser ? `compte …${cUser.slice(-4)}` : "session illisible"
}
