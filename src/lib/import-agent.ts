// ============================================================================
// IMPORTER DES CLIENTS DEPUIS UN FICHIER.
//
// Cinq formats lus : JSON, CSV, texte, vCard, xlsx. Le but n'est pas de tout
// comprendre, c'est de ne JAMAIS inventer : une ligne douteuse est écartée et
// signalée, jamais devinée. Un carnet de clients faux coûte plus cher qu'un
// carnet incomplet.
//
// ── LE PIÈGE DU NUMÉRO ─────────────────────────────────────────────────────
//
// Un fichier passé par Excel contient souvent « 701020304 » : le tableur a
// mangé le zéro de tête. On ne peut pas le rajouter au hasard — en Côte
// d'Ivoire le premier chiffre identifie l'opérateur (01 Moov, 05 MTN, 07
// Orange), et se tromper, c'est écrire à quelqu'un d'autre. Un numéro à neuf
// chiffres est donc REFUSÉ, avec une explication, plutôt que complété.
// ============================================================================

import { inflateRawSync } from "node:zlib"

export interface LigneImport {
  nom: string
  telephone: string
  telephone_2?: string | null
  email?: string | null
  quartier?: string | null
  ville?: string | null
  profession?: string | null
  notes?: string | null
  canal?: string | null
}

export interface Analyse {
  format: string
  lignes: LigneImport[]
  rejets: { ligne: string; raison: string }[]
}

/** Dix derniers chiffres — même clé que la base. */
export function cleTelephone(brut: string): string {
  return (brut ?? "").replace(/\D/g, "").slice(-10)
}

/**
 * Un numéro ivoirien exploitable, ou `null` avec la raison.
 *
 * Dix chiffres, et un préfixe qui existe. Les autres pays passent aussi
 * (format international), mais un « presque numéro » est refusé.
 */
export function verifierNumero(brut: string): { ok: string } | { erreur: string } {
  const chiffres = (brut ?? "").replace(/\D/g, "")
  if (!chiffres) return { erreur: "aucun numéro" }
  if (chiffres.length < 8) return { erreur: "numéro trop court" }

  if (chiffres.length === 9) {
    return {
      erreur:
        "neuf chiffres — le zéro de tête a probablement été mangé par un tableur. " +
        "Corrigez le fichier : le premier chiffre désigne l'opérateur et ne se devine pas.",
    }
  }

  const local = chiffres.length > 10 ? chiffres.slice(-10) : chiffres
  if (local.length === 10) {
    const prefixe = local.slice(0, 2)
    if (!["01", "05", "07", "21", "25", "27"].includes(prefixe)) {
      // Pas un rejet : un numéro étranger à dix chiffres est possible. On le
      // garde tel quel, c'est l'agent qui saura.
      return { ok: brut.trim() }
    }
    return { ok: local }
  }
  return { ok: brut.trim() }
}

// ── Aiguillage ──────────────────────────────────────────────────────────────

export function analyser(nomFichier: string, contenu: Buffer): Analyse {
  const ext = (nomFichier.split(".").pop() ?? "").toLowerCase()

  if (ext === "xlsx" || estZip(contenu)) return depuisXlsx(contenu)

  const texte = contenu.toString("utf8").replace(/^﻿/, "")

  if (ext === "json" || texte.trimStart().startsWith("{") || texte.trimStart().startsWith("[")) {
    return depuisJson(texte)
  }
  if (ext === "vcf" || /BEGIN:VCARD/i.test(texte)) return depuisVCard(texte)
  if (ext === "csv" || ext === "tsv") return depuisCsv(texte)
  return depuisTexte(texte)
}

const estZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b

// ── JSON ────────────────────────────────────────────────────────────────────

function depuisJson(texte: string): Analyse {
  const rejets: Analyse["rejets"] = []
  let brut: unknown
  try { brut = JSON.parse(texte) } catch (e) {
    return { format: "json", lignes: [], rejets: [{ ligne: "", raison: `fichier illisible : ${(e as Error).message}` }] }
  }

  const tableau = Array.isArray(brut)
    ? brut
    : Array.isArray((brut as { clients?: unknown[] })?.clients)
      ? (brut as { clients: unknown[] }).clients
      : []

  if (!tableau.length) {
    return { format: "json", lignes: [], rejets: [{ ligne: "", raison: "aucun client dans le fichier" }] }
  }

  const lignes: LigneImport[] = []
  for (const o of tableau as Record<string, unknown>[]) {
    const r = construire({
      nom: chaine(o.nom) || `${chaine(o.prenom)} ${chaine(o.nom_famille)}`.trim(),
      telephone: chaine(o.telephone) || chaine(o.phone) || chaine(o.tel),
      telephone_2: chaine(o.telephone_2),
      email: chaine(o.email),
      quartier: chaine(o.quartier),
      ville: chaine(o.ville),
      profession: chaine(o.profession),
      notes: chaine(o.notes),
      canal: chaine(o.canal),
    })
    if ("erreur" in r) rejets.push({ ligne: chaine(o.nom) || JSON.stringify(o).slice(0, 60), raison: r.erreur })
    else lignes.push(r.ligne)
  }
  return { format: "json", lignes, rejets }
}

const chaine = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())

// ── CSV ─────────────────────────────────────────────────────────────────────

function depuisCsv(texte: string): Analyse {
  const rejets: Analyse["rejets"] = []
  // Notre propre export commence par « sep=; » : Excel le lit, un analyseur
  // naïf le prendrait pour une ligne de données.
  const brut = texte.replace(/^sep=.\r?\n/i, "")
  const lignesBrutes = brut.split(/\r?\n/).filter(l => l.trim())
  if (!lignesBrutes.length) {
    return { format: "csv", lignes: [], rejets: [{ ligne: "", raison: "fichier vide" }] }
  }

  const sep = detecterSeparateur(lignesBrutes[0])
  const entetes = decouper(lignesBrutes[0], sep).map(normaliser)
  const carte = associerColonnes(entetes)

  if (carte.nom < 0 && carte.telephone < 0) {
    return {
      format: "csv",
      lignes: [],
      rejets: [{
        ligne: lignesBrutes[0].slice(0, 80),
        raison: "aucune colonne « nom » ni « téléphone » reconnue dans l'en-tête",
      }],
    }
  }

  const lignes: LigneImport[] = []
  for (const l of lignesBrutes.slice(1)) {
    const cases = decouper(l, sep)
    const prendre = (i: number) => (i >= 0 ? nettoyerCase(cases[i] ?? "") : "")
    const r = construire({
      nom: prendre(carte.nom),
      telephone: prendre(carte.telephone),
      telephone_2: prendre(carte.telephone_2),
      email: prendre(carte.email),
      quartier: prendre(carte.quartier),
      ville: prendre(carte.ville),
      profession: prendre(carte.profession),
      notes: prendre(carte.notes),
    })
    if ("erreur" in r) rejets.push({ ligne: l.slice(0, 80), raison: r.erreur })
    else lignes.push(r.ligne)
  }
  return { format: "csv", lignes, rejets }
}

function detecterSeparateur(entete: string): string {
  const candidats = [";", "\t", ",", "|"]
  let meilleur = ";", score = 0
  for (const c of candidats) {
    const n = entete.split(c).length
    if (n > score) { score = n; meilleur = c }
  }
  return meilleur
}

/** Découpe en respectant les guillemets. */
function decouper(ligne: string, sep: string): string[] {
  const cases: string[] = []
  let courant = ""
  let dansGuillemets = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') { courant += '"'; i++ }
      else dansGuillemets = !dansGuillemets
    } else if (c === sep && !dansGuillemets) {
      cases.push(courant); courant = ""
    } else courant += c
  }
  cases.push(courant)
  return cases
}

/** `="0701020304"` — la formule que NOUS écrivons pour sauver le zéro de tête. */
function nettoyerCase(v: string): string {
  const t = v.trim()
  const m = /^="?(.*?)"?$/.exec(t)
  return (m ? m[1] : t).trim()
}

const normaliser = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "")

interface Carte {
  nom: number; telephone: number; telephone_2: number; email: number
  quartier: number; ville: number; profession: number; notes: number
}

/**
 * Reconnaît les colonnes quel que soit l'intitulé.
 *
 * Les fichiers viennent d'un peu partout : un export de téléphone, un tableau
 * tapé à la main, notre propre export. Exiger un intitulé exact ferait échouer
 * la quasi-totalité des imports réels.
 */
function associerColonnes(entetes: string[]): Carte {
  const trouver = (...mots: string[]) =>
    entetes.findIndex(e => mots.some(m => e.includes(m)))

  const telephone = trouver("telephone", "tel", "phone", "numero", "contact", "mobile", "portable")
  return {
    nom: trouver("nometprenoms", "nomprenom", "nom", "name", "client", "prenom"),
    telephone,
    telephone_2: entetes.findIndex((e, i) =>
      i !== telephone && (e.includes("2etelephone") || e.includes("telephone2") || e.includes("tel2") || e.includes("autretel"))),
    email: trouver("email", "mail", "courriel"),
    quartier: trouver("quartier", "zone"),
    ville: trouver("commune", "ville", "city"),
    profession: trouver("profession", "metier", "activite", "fonction"),
    notes: trouver("notes", "note", "remarque", "observation", "commentaire"),
  }
}

// ── vCard ───────────────────────────────────────────────────────────────────

function depuisVCard(texte: string): Analyse {
  const rejets: Analyse["rejets"] = []
  const lignes: LigneImport[] = []

  // Une vCard replie les lignes longues : la suite commence par une espace.
  const deplie = texte.replace(/\r?\n[ \t]/g, "")
  const cartes = deplie.split(/BEGIN:VCARD/i).slice(1)

  for (const carte of cartes) {
    const champ = (nom: string) => {
      const m = new RegExp(`^${nom}[^:\\r\\n]*:(.*)$`, "im").exec(carte)
      return m ? m[1].trim().replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ") : ""
    }
    const tels = [...carte.matchAll(/^TEL[^:\r\n]*:(.*)$/gim)].map(m => m[1].trim())
    const n = champ("N")
    const fn = champ("FN")
    // « DOUMBIA;Prince;;; » → « DOUMBIA Prince »
    const depuisN = n ? n.split(";").filter(Boolean).join(" ").trim() : ""

    const r = construire({
      nom: fn || depuisN,
      telephone: tels[0] ?? "",
      telephone_2: tels[1] ?? "",
      email: champ("EMAIL"),
      quartier: (champ("ADR").split(";")[2] ?? "").trim(),
      ville: (champ("ADR").split(";")[3] ?? "").trim(),
      profession: champ("TITLE"),
      notes: champ("NOTE"),
    })
    if ("erreur" in r) rejets.push({ ligne: (fn || depuisN || "carte sans nom").slice(0, 60), raison: r.erreur })
    else lignes.push(r.ligne)
  }
  return { format: "vcard", lignes, rejets }
}

// ── Texte libre ─────────────────────────────────────────────────────────────

function depuisTexte(texte: string): Analyse {
  const rejets: Analyse["rejets"] = []
  const lignes: LigneImport[] = []
  const vues = new Set<string>()

  for (const brute of texte.split(/\r?\n/)) {
    const l = brute.trim()
    if (!l || l.length < 6) continue

    // Une ligne d'en-tête de document (« Tél : 27 31 ... ») n'est pas un
    // client. Le deux-points et les puces les trahissent : c'est le piège qui
    // créait des clients fantômes dans ClientPro en réimportant son propre
    // rapport.
    const m = /(\+?\d[\d\s.\-()]{7,})/.exec(l)
    if (!m) continue

    const numero = m[1]
    const avant = l.slice(0, m.index).trim()
    const nom = avant
      .replace(/^[-•*\d.)\s]+/, "")
      .replace(/(t[ée]l[ée]phone|t[ée]l|contact|num[ée]ro|mobile|portable)\s*:?\s*$/i, "")
      .replace(/[:;,]\s*$/, "")
      .trim()

    if (!nom || nom.length < 2) { rejets.push({ ligne: l.slice(0, 70), raison: "aucun nom avant le numéro" }); continue }
    if (/[:•]/.test(nom)) { rejets.push({ ligne: l.slice(0, 70), raison: "ressemble à un en-tête de document" }); continue }

    const cle = cleTelephone(numero)
    if (vues.has(cle)) continue
    vues.add(cle)

    const r = construire({ nom, telephone: numero })
    if ("erreur" in r) rejets.push({ ligne: l.slice(0, 70), raison: r.erreur })
    else lignes.push(r.ligne)
  }
  return { format: "texte", lignes, rejets }
}

// ── XLSX ────────────────────────────────────────────────────────────────────

function depuisXlsx(contenu: Buffer): Analyse {
  let fichiers: Map<string, Buffer>
  try { fichiers = dezipper(contenu) } catch (e) {
    return { format: "xlsx", lignes: [], rejets: [{ ligne: "", raison: `classeur illisible : ${(e as Error).message}` }] }
  }

  const feuille = fichiers.get("xl/worksheets/sheet1.xml")
  if (!feuille) {
    return { format: "xlsx", lignes: [], rejets: [{ ligne: "", raison: "aucune feuille trouvée dans le classeur" }] }
  }

  // Les chaînes partagées : Excel range le texte là plutôt que dans les
  // cellules. Notre propre export n'en utilise pas, mais tous les autres si.
  const partagees: string[] = []
  const brutPartagees = fichiers.get("xl/sharedStrings.xml")?.toString("utf8")
  if (brutPartagees) {
    for (const m of brutPartagees.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      partagees.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => desechapper(t[1])).join(""))
    }
  }

  const xml = feuille.toString("utf8")
  const grille: string[][] = []
  for (const mLigne of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cases: string[] = []
    for (const mCase of mLigne[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = mCase[1]
      const dedans = mCase[2]
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? ""
      const i = indiceColonne(ref)
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? ""

      let valeur = ""
      if (type === "inlineStr") {
        valeur = [...dedans.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => desechapper(t[1])).join("")
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(dedans)?.[1] ?? ""
        valeur = type === "s" ? (partagees[Number(v)] ?? "") : desechapper(v)
      }
      while (cases.length < i) cases.push("")
      cases[i] = valeur
    }
    grille.push(cases)
  }

  if (!grille.length) {
    return { format: "xlsx", lignes: [], rejets: [{ ligne: "", raison: "classeur vide" }] }
  }

  const entetes = grille[0].map(normaliser)
  const carte = associerColonnes(entetes)
  if (carte.nom < 0 && carte.telephone < 0) {
    return {
      format: "xlsx", lignes: [],
      rejets: [{ ligne: grille[0].join(" | ").slice(0, 80), raison: "aucune colonne « nom » ni « téléphone » reconnue" }],
    }
  }

  const rejets: Analyse["rejets"] = []
  const lignes: LigneImport[] = []
  for (const ligne of grille.slice(1)) {
    const prendre = (i: number) => (i >= 0 ? (ligne[i] ?? "").trim() : "")
    const r = construire({
      nom: prendre(carte.nom),
      telephone: prendre(carte.telephone),
      telephone_2: prendre(carte.telephone_2),
      email: prendre(carte.email),
      quartier: prendre(carte.quartier),
      ville: prendre(carte.ville),
      profession: prendre(carte.profession),
      notes: prendre(carte.notes),
    })
    if ("erreur" in r) rejets.push({ ligne: ligne.filter(Boolean).join(" | ").slice(0, 80), raison: r.erreur })
    else lignes.push(r.ligne)
  }
  return { format: "xlsx", lignes, rejets }
}

const desechapper = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")

function indiceColonne(ref: string): number {
  let n = 0
  for (const c of ref) n = n * 26 + (c.charCodeAt(0) - 64)
  return Math.max(0, n - 1)
}

/** Dézippe en mémoire : on lit le répertoire central, pas les en-têtes locaux. */
function dezipper(buf: Buffer): Map<string, Buffer> {
  const fichiers = new Map<string, Buffer>()

  let finRepertoire = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { finRepertoire = i; break }
  }
  if (finRepertoire < 0) throw new Error("ce n'est pas un fichier ZIP")

  const nombre = buf.readUInt16LE(finRepertoire + 10)
  let p = buf.readUInt32LE(finRepertoire + 16)

  for (let n = 0; n < nombre; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const methode = buf.readUInt16LE(p + 10)
    const tailleCompressee = buf.readUInt32LE(p + 20)
    const longueurNom = buf.readUInt16LE(p + 28)
    const longueurExtra = buf.readUInt16LE(p + 30)
    const longueurCommentaire = buf.readUInt16LE(p + 32)
    const debutLocal = buf.readUInt32LE(p + 42)
    const nom = buf.toString("utf8", p + 46, p + 46 + longueurNom)

    // L'en-tête local a ses propres longueurs de nom et d'extra : elles
    // diffèrent souvent de celles du répertoire central, et s'en remettre aux
    // secondes décale la lecture de quelques octets — donc tout casse.
    const nomLocal = buf.readUInt16LE(debutLocal + 26)
    const extraLocal = buf.readUInt16LE(debutLocal + 28)
    const debutDonnees = debutLocal + 30 + nomLocal + extraLocal
    const donnees = buf.subarray(debutDonnees, debutDonnees + tailleCompressee)

    fichiers.set(nom, methode === 0 ? Buffer.from(donnees) : inflateRawSync(donnees))
    p += 46 + longueurNom + longueurExtra + longueurCommentaire
  }
  return fichiers
}

// ── Construction d'une ligne ────────────────────────────────────────────────

function construire(brut: {
  nom: string; telephone: string
  telephone_2?: string; email?: string; quartier?: string
  ville?: string; profession?: string; notes?: string; canal?: string
}): { ligne: LigneImport } | { erreur: string } {
  const nom = (brut.nom ?? "").trim().replace(/\s+/g, " ")
  if (!nom) return { erreur: "aucun nom" }
  if (nom.length > 120) return { erreur: "nom anormalement long" }

  const tel = verifierNumero(brut.telephone ?? "")
  if ("erreur" in tel) return { erreur: tel.erreur }

  const second = brut.telephone_2 ? verifierNumero(brut.telephone_2) : null

  return {
    ligne: {
      nom,
      telephone: tel.ok,
      telephone_2: second && "ok" in second ? second.ok : null,
      email: vide(brut.email),
      quartier: vide(brut.quartier),
      ville: vide(brut.ville),
      profession: vide(brut.profession),
      notes: vide(brut.notes),
      canal: brut.canal && brut.canal.trim() ? brut.canal.trim() : "autre",
    },
  }
}

const vide = (v: string | undefined) => (v && v.trim() ? v.trim().slice(0, 1000) : null)
