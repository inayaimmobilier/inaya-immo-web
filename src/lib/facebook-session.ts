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
    // Les extensions n'exportent pas toutes pareil (constaté le 27/09/2026 avec
    // « Éditeur de cookies ») : liste [ … ], objets à la suite SANS crochets,
    // un seul objet, ou { cookies: [ … ] }. On accepte tout cela.
    const essais = [texte, `[${texte.replace(/}\s*,?\s*{/g, "},{")}]`]
    let j: unknown = undefined
    for (const e of essais) { try { j = JSON.parse(e); break } catch { /* essai suivant */ } }
    if (j === undefined) return { ok: false, erreur: "Le texte collé n'est pas un export JSON lisible. Recopiez l'export complet des cookies de facebook.com." }
    const brut = Array.isArray(j) ? j
      : Array.isArray((j as { cookies?: unknown }).cookies) ? (j as { cookies: unknown[] }).cookies
      : (j as { name?: unknown }).name ? [j]
      // Objet « nom → valeur » ({ "c_user": "…", "xs": "…" }).
      : Object.entries(j as Record<string, unknown>).map(([name, value]) => ({ name, value }))
    for (const c of brut.flat() as { name?: string; value?: unknown; domain?: string }[]) {
      if (c?.name && typeof c.value === "string" && estFacebook(c.domain)) cookies.set(c.name, c.value)
    }
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
    const manquent = ["c_user", "xs"].filter(n => !cookies.get(n)).map(n => `« ${n} »`).join(" et ")
    const trouves = cookies.size ? `${cookies.size} cookie${cookies.size > 1 ? "s" : ""} lu${cookies.size > 1 ? "s" : ""} (${[...cookies.keys()].slice(0, 6).join(", ")})` : "aucun cookie lu"
    return {
      ok: false,
      erreur: `Session incomplète : il manque ${manquent} — ${trouves}. ` +
        "Il faut coller l'export de TOUS les cookies de facebook.com (bouton Exporter de l'extension, format JSON), pas un seul cookie. " +
        (cookies.get("c_user") && !cookies.get("xs")
          ? "« xs » est un cookie protégé : si votre extension ne l'exporte pas, utilisez « Cookie-Editor » (cookie-editor.com), qui l'inclut."
          : ""),
    }
  }
  const entete = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
  return { ok: true, entete, cUser, nombre: cookies.size }
}

/** Identifiant affichable d'une session, sans rien en dévoiler d'utile. */
export function resumeSession(entete: string): string {
  const cUser = entete.match(/(?:^|;\s*)c_user=(\d+)/)?.[1]
  return cUser ? `compte …${cUser.slice(-4)}` : "session illisible"
}
