// ============================================================================
// EXPORTER LE CARNET DE CLIENTS.
//
// Cinq formats, chacun pour un usage réel :
//
//   json   la seule sauvegarde qui se réimporte à l'identique
//   csv    s'ouvre dans Excel et dans tout le reste
//   xlsx   un vrai classeur, colonnes typées
//   texte  un rapport qu'on lit, qu'on colle dans un message
//   vcard  le carnet de contacts du téléphone
//
// ── LE PIÈGE DES NUMÉROS IVOIRIENS ─────────────────────────────────────────
//
// « 0701020304 » ouvert dans Excel devient 701020304 : le tableur y voit un
// nombre et mange le zéro de tête. Or ce zéro fait partie du numéro. Un
// carnet exporté puis rouvert donnerait donc des numéros faux, en silence.
//
// D'où : en CSV la formule `="0701020304"`, en xlsx un type CHAÎNE explicite.
// Ce n'est pas une coquetterie, c'est la différence entre un fichier utilisable
// et un fichier qui trahit.
//
// Aucune bibliothèque : le xlsx est un ZIP de XML, et `zlib` est dans Node.
// Importer un moteur de tableur pour écrire six colonnes serait payer très
// cher une chose qu'on fait en cent lignes.
// ============================================================================

import { deflateRawSync } from "node:zlib"

export interface ClientExport {
  nom: string
  telephone: string
  telephone_2: string | null
  email: string | null
  quartier: string | null
  ville: string | null
  profession: string | null
  canal: string
  statut: string
  relance_le: string | null
  notes: string | null
  date_naissance?: string | null
  created_at: string
  propositions_total?: number
  propositions_conclues?: number
  requetes_actives?: number
}

export const COLONNES: { cle: keyof ClientExport; titre: string }[] = [
  { cle: "nom", titre: "Nom et prénoms" },
  { cle: "telephone", titre: "Téléphone" },
  { cle: "telephone_2", titre: "2e téléphone" },
  { cle: "email", titre: "E-mail" },
  { cle: "quartier", titre: "Quartier" },
  { cle: "ville", titre: "Commune" },
  { cle: "profession", titre: "Profession" },
  { cle: "canal", titre: "Rencontré par" },
  { cle: "statut", titre: "État du dossier" },
  { cle: "relance_le", titre: "À rappeler le" },
  { cle: "date_naissance", titre: "Date de naissance" },
  { cle: "propositions_total", titre: "Biens proposés" },
  { cle: "propositions_conclues", titre: "Affaires conclues" },
  { cle: "requetes_actives", titre: "Recherches actives" },
  { cle: "notes", titre: "Notes" },
  { cle: "created_at", titre: "Client depuis" },
]

const texte = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v)

/** Les colonnes qu'un tableur ne doit surtout pas prendre pour des nombres. */
const COLONNES_TEXTE = new Set(["telephone", "telephone_2"])

// ── JSON ────────────────────────────────────────────────────────────────────

export function versJson(clients: ClientExport[]): string {
  return JSON.stringify(
    {
      format: "inaya-agent-clients",
      version: 1,
      exporte_le: new Date().toISOString(),
      clients,
    },
    null,
    2,
  )
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function versCsv(clients: ClientExport[]): string {
  const echappe = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lignes: string[] = []

  // `sep=;` : Excel en français attend le point-virgule. Sans cette ligne, tout
  // le fichier atterrit dans une seule colonne.
  lignes.push("sep=;")
  lignes.push(COLONNES.map(c => echappe(c.titre)).join(";"))

  for (const cl of clients) {
    lignes.push(
      COLONNES.map(c => {
        const v = texte(cl[c.cle])
        if (!v) return '""'
        // La formule force le texte : sans elle, Excel mange le 0 initial.
        return COLONNES_TEXTE.has(c.cle) ? `="${v.replace(/"/g, "")}"` : echappe(v)
      }).join(";"),
    )
  }
  // Le BOM, sinon Excel lit les accents en caractères abîmés.
  return "\uFEFF" + lignes.join("\r\n")
}

// ── Texte ───────────────────────────────────────────────────────────────────

export function versTexte(clients: ClientExport[], agent: string): string {
  const l: string[] = []
  l.push("CARNET DE CLIENTS — INAYA IMMO")
  l.push(`Agent : ${agent}`)
  l.push(`Édité le ${new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}`)
  l.push(`${clients.length} client${clients.length > 1 ? "s" : ""}`)
  l.push("=".repeat(60))
  l.push("")

  for (const c of clients) {
    l.push(c.nom.toUpperCase())
    l.push(`  Téléphone   : ${c.telephone}${c.telephone_2 ? ` / ${c.telephone_2}` : ""}`)
    if (c.quartier || c.ville) l.push(`  Lieu        : ${[c.ville, c.quartier].filter(Boolean).join(" · ")}`)
    if (c.profession) l.push(`  Profession  : ${c.profession}`)
    l.push(`  Dossier     : ${c.statut}${c.relance_le ? ` — à rappeler le ${c.relance_le}` : ""}`)
    if (c.propositions_total) {
      l.push(`  Suivi       : ${c.propositions_total} bien(s) proposé(s), ${c.propositions_conclues ?? 0} conclu(s)`)
    }
    if (c.notes) l.push(`  Notes       : ${c.notes.replace(/\s+/g, " ").slice(0, 300)}`)
    l.push("")
  }
  return l.join("\r\n")
}

// ── vCard ───────────────────────────────────────────────────────────────────

export function versVCard(clients: ClientExport[]): string {
  const echappe = (v: string) => v.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n")
  const blocs: string[] = []

  for (const c of clients) {
    const parts = c.nom.trim().split(/\s+/)
    const nom = parts[0] ?? c.nom
    const prenoms = parts.slice(1).join(" ")

    const b: string[] = ["BEGIN:VCARD", "VERSION:3.0"]
    b.push(`N:${echappe(nom)};${echappe(prenoms)};;;`)
    b.push(`FN:${echappe(c.nom)}`)
    b.push(`TEL;TYPE=CELL:${c.telephone}`)
    if (c.telephone_2) b.push(`TEL;TYPE=CELL:${c.telephone_2}`)
    if (c.email) b.push(`EMAIL:${echappe(c.email)}`)
    if (c.quartier || c.ville) {
      b.push(`ADR;TYPE=HOME:;;${echappe(c.quartier ?? "")};${echappe(c.ville ?? "")};;;`)
    }
    // L'organisation marque d'où vient le contact : dans un répertoire de
    // plusieurs milliers d'entrées, c'est ce qui permet de les retrouver.
    b.push("ORG:Client Inaya")
    if (c.profession) b.push(`TITLE:${echappe(c.profession)}`)
    if (c.notes) b.push(`NOTE:${echappe(c.notes.slice(0, 500))}`)
    b.push("END:VCARD")
    blocs.push(b.join("\r\n"))
  }
  return blocs.join("\r\n")
}

// ── XLSX ────────────────────────────────────────────────────────────────────
//
// Un .xlsx est un ZIP contenant quelques fichiers XML. On écrit le minimum
// qu'Excel accepte : les types de contenu, la relation vers le classeur, le
// classeur, et une feuille.

const echapperXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Les caractères de contrôle rendent le fichier illisible par Excel, qui
    // annonce alors « classeur endommagé » sans dire pourquoi. En octets
    // bruts ils seraient invisibles dans un éditeur, et effacés sans le savoir.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")

function colonneNom(i: number): string {
  let n = i + 1, s = ""
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

export function versXlsx(clients: ClientExport[]): Buffer {
  const lignes: string[] = []

  const entete = COLONNES.map((c, i) =>
    `<c r="${colonneNom(i)}1" t="inlineStr" s="1"><is><t>${echapperXml(c.titre)}</t></is></c>`).join("")
  lignes.push(`<row r="1">${entete}</row>`)

  clients.forEach((cl, n) => {
    const r = n + 2
    const cellules = COLONNES.map((c, i) => {
      const v = texte(cl[c.cle])
      if (!v) return ""
      const ref = `${colonneNom(i)}${r}`
      // Un nombre reste un nombre SAUF s'il s'agit d'un numéro de téléphone :
      // là, le zéro de tête doit survivre.
      const numerique = !COLONNES_TEXTE.has(c.cle) && /^\d+$/.test(v) && !v.startsWith("0")
      return numerique
        ? `<c r="${ref}"><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${echapperXml(v)}</t></is></c>`
    }).join("")
    lignes.push(`<row r="${r}">${cellules}</row>`)
  })

  const feuille = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${COLONNES.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(40, Math.max(12, c.titre.length + 6))}" customWidth="1"/>`).join("")}</cols>
<sheetData>${lignes.join("")}</sheetData></worksheet>`

  const classeur = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Clients" sheetId="1" r:id="rId1"/></sheets></workbook>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs>
</styleSheet>`

  return zip([
    {
      nom: "[Content_Types].xml",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      nom: "_rels/.rels",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nom: "xl/_rels/workbook.xml.rels",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nom: "xl/workbook.xml", contenu: classeur },
    { nom: "xl/styles.xml", contenu: styles },
    { nom: "xl/worksheets/sheet1.xml", contenu: feuille },
  ])
}

// ── Un ZIP minimal ──────────────────────────────────────────────────────────

interface Entree { nom: string; contenu: string }

/**
 * CRC-32, écrit ici plutôt qu'importé de `zlib`.
 *
 * `zlib.crc32` n'existe qu'à partir de Node 20.15. Si l'hébergeur tourne sur
 * une version plus ancienne, l'import ne casse pas au démarrage mais à
 * l'exécution, la première fois qu'un agent demande un export — c'est-à-dire
 * là où on ne le verrait pas. Quinze lignes valent mieux que ce pari.
 */
const TABLE_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(entrees: Entree[]): Buffer {
  const locales: Buffer[] = []
  const centrales: Buffer[] = []
  let decalage = 0

  for (const e of entrees) {
    const nom = Buffer.from(e.nom, "utf8")
    const brut = Buffer.from(e.contenu, "utf8")
    const compresse = deflateRawSync(brut)
    const somme = crc32(brut)

    const enteteLocale = Buffer.alloc(30)
    enteteLocale.writeUInt32LE(0x04034b50, 0)
    enteteLocale.writeUInt16LE(20, 4)      // version minimale
    enteteLocale.writeUInt16LE(0x0800, 6)  // drapeau : noms en UTF-8
    enteteLocale.writeUInt16LE(8, 8)       // deflate
    enteteLocale.writeUInt32LE(0, 10)      // date/heure : sans intérêt ici
    enteteLocale.writeUInt32LE(somme, 14)
    enteteLocale.writeUInt32LE(compresse.length, 18)
    enteteLocale.writeUInt32LE(brut.length, 22)
    enteteLocale.writeUInt16LE(nom.length, 26)
    enteteLocale.writeUInt16LE(0, 28)

    locales.push(enteteLocale, nom, compresse)

    const centrale = Buffer.alloc(46)
    centrale.writeUInt32LE(0x02014b50, 0)
    centrale.writeUInt16LE(20, 4)
    centrale.writeUInt16LE(20, 6)
    centrale.writeUInt16LE(0x0800, 8)
    centrale.writeUInt16LE(8, 10)
    centrale.writeUInt32LE(0, 12)
    centrale.writeUInt32LE(somme, 16)
    centrale.writeUInt32LE(compresse.length, 20)
    centrale.writeUInt32LE(brut.length, 24)
    centrale.writeUInt16LE(nom.length, 28)
    centrale.writeUInt16LE(0, 30)
    centrale.writeUInt16LE(0, 32)
    centrale.writeUInt16LE(0, 34)
    centrale.writeUInt16LE(0, 36)
    centrale.writeUInt32LE(0, 38)
    centrale.writeUInt32LE(decalage, 42)

    centrales.push(centrale, nom)
    decalage += enteteLocale.length + nom.length + compresse.length
  }

  const corps = Buffer.concat(locales)
  const repertoire = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(0, 4)
  fin.writeUInt16LE(0, 6)
  fin.writeUInt16LE(entrees.length, 8)
  fin.writeUInt16LE(entrees.length, 10)
  fin.writeUInt32LE(repertoire.length, 12)
  fin.writeUInt32LE(corps.length, 16)
  fin.writeUInt16LE(0, 20)

  return Buffer.concat([corps, repertoire, fin])
}
