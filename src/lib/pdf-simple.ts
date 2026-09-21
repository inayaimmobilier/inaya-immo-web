// ============================================================================
// UN GÉNÉRATEUR DE PDF MINIMAL.
//
// Juste ce qu'il faut pour imprimer une liste : un titre, un tableau, une
// pagination. Pas de bibliothèque — celles qui existent embarquent des polices
// et se brouillent avec les empaqueteurs de Next, et l'on paierait très cher
// une chose qui tient en deux cents lignes.
//
// ── L'ENCODAGE, QUI EST TOUT LE SUJET ──────────────────────────────────────
//
// Les polices natives d'un lecteur PDF (Helvetica & co) n'attendent PAS de
// l'UTF-8 mais du WinAnsi, c'est-à-dire du cp1252. Écrire « Bouaké » en UTF-8
// donnerait « BouakÃ© » à l'écran. Toute chaîne est donc convertie ici, et les
// caractères hors cp1252 sont remplacés par un équivalent lisible plutôt que
// par un carré vide.
// ============================================================================

const LARGEUR = 595.28   // A4 en points
const HAUTEUR = 841.89
const MARGE = 40

/** Les rares caractères que cp1252 ne connaît pas et qu'on voit vraiment passer. */
const REMPLACEMENTS: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "…": "...", " ": " ",
  " ": " ", "€": "", "œ": "", "Œ": "",
}

/**
 * UTF-16 → cp1252, avec repli lisible.
 *
 * Un caractère inconnu devient « ? » : un carré vide ferait croire à un bogue
 * d'affichage, alors qu'il signale simplement une lettre qu'on ne sait pas
 * imprimer avec une police native.
 */
function versWinAnsi(s: string): Buffer {
  const sortie: number[] = []
  for (const c of s) {
    const remplace = REMPLACEMENTS[c]
    const car = remplace !== undefined ? remplace : c
    for (const d of car) {
      const code = d.codePointAt(0) ?? 63
      sortie.push(code <= 0xff ? code : 63)
    }
  }
  return Buffer.from(sortie)
}

/** Dans une chaîne PDF, la parenthèse et la barre oblique inverse se ferment. */
function chaine(s: string): string {
  const buf = versWinAnsi(s)
  let sortie = ""
  for (const o of buf) {
    if (o === 0x28 || o === 0x29 || o === 0x5c) sortie += "\\" + String.fromCharCode(o)
    else if (o < 32 || o > 126) sortie += "\\" + o.toString(8).padStart(3, "0")
    else sortie += String.fromCharCode(o)
  }
  return sortie
}

/** Largeur approchée d'un texte en Helvetica, pour savoir où couper. */
function largeur(s: string, taille: number): number {
  // Moyenne mesurée sur Helvetica : suffisant pour décider d'une troncature,
  // et sans la table de 256 largeurs qu'on n'a pas besoin d'embarquer.
  return s.length * taille * 0.5
}

function tronquer(s: string, taille: number, max: number): string {
  if (largeur(s, taille) <= max) return s
  let coupe = s
  while (coupe.length > 1 && largeur(coupe + "...", taille) > max) coupe = coupe.slice(0, -1)
  return coupe + "..."
}

export interface ColonnePdf { titre: string; largeur: number; cle: string }

export interface OptionsPdf {
  titre: string
  sousTitre?: string
  colonnes: ColonnePdf[]
  lignes: Record<string, string>[]
  piedDePage?: string
}

export function tableauPdf(o: OptionsPdf): Buffer {
  const pages: string[] = []
  const largeurUtile = LARGEUR - 2 * MARGE

  let flux: string[] = []
  let y = 0
  let premierePage = true

  const nouvellePage = () => {
    if (flux.length) pages.push(flux.join("\n"))
    flux = []
    y = HAUTEUR - MARGE

    if (premierePage) {
      flux.push(`BT /F2 16 Tf ${MARGE} ${y - 14} Td (${chaine(o.titre)}) Tj ET`)
      y -= 22
      if (o.sousTitre) {
        flux.push(`BT /F1 9 Tf ${MARGE} ${y - 10} Td (${chaine(o.sousTitre)}) Tj ET`)
        y -= 18
      }
      premierePage = false
    } else {
      flux.push(`BT /F1 8 Tf ${MARGE} ${y - 8} Td (${chaine(o.titre + " (suite)")}) Tj ET`)
      y -= 18
    }

    // L'en-tête du tableau est répété sur CHAQUE page : une page arrachée
    // d'une liasse doit rester lisible seule.
    let x = MARGE
    flux.push("0.06 0.16 0.36 rg")
    flux.push(`${MARGE} ${y - 14} ${largeurUtile} 16 re f`)
    flux.push("1 1 1 rg")
    for (const c of o.colonnes) {
      flux.push(`BT /F2 8 Tf ${x + 3} ${y - 10} Td (${chaine(tronquer(c.titre, 8, c.largeur - 6))}) Tj ET`)
      x += c.largeur
    }
    flux.push("0 0 0 rg")
    y -= 20
  }

  nouvellePage()

  o.lignes.forEach((ligne, i) => {
    if (y < MARGE + 40) nouvellePage()

    // Une ligne sur deux est grisée : sur seize colonnes, l'œil perd sa ligne
    // sans cela.
    if (i % 2 === 1) {
      flux.push("0.95 0.96 0.98 rg")
      flux.push(`${MARGE} ${y - 4} ${largeurUtile} 14 re f`)
      flux.push("0 0 0 rg")
    }

    let x = MARGE
    for (const c of o.colonnes) {
      const v = ligne[c.cle] ?? ""
      if (v) flux.push(`BT /F1 8 Tf ${x + 3} ${y} Td (${chaine(tronquer(v, 8, c.largeur - 6))}) Tj ET`)
      x += c.largeur
    }
    y -= 14
  })

  if (o.piedDePage) {
    flux.push(`BT /F1 7 Tf ${MARGE} ${MARGE - 10} Td (${chaine(o.piedDePage)}) Tj ET`)
  }
  pages.push(flux.join("\n"))

  return assembler(pages)
}

/** Assemble les objets PDF et leur table de références croisées. */
function assembler(pages: string[]): Buffer {
  const objets: string[] = []
  const idPages = 2
  const idPolice1 = 3
  const idPolice2 = 4

  objets[1] = `<< /Type /Catalog /Pages ${idPages} 0 R >>`
  objets[idPolice1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  objets[idPolice2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"

  let prochain = 5
  const idsPages: number[] = []

  for (const contenu of pages) {
    const idContenu = prochain++
    const idPage = prochain++
    objets[idContenu] = `<< /Length ${Buffer.byteLength(contenu, "latin1")} >>\nstream\n${contenu}\nendstream`
    objets[idPage] =
      `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] ` +
      `/Resources << /Font << /F1 ${idPolice1} 0 R /F2 ${idPolice2} 0 R >> >> ` +
      `/Contents ${idContenu} 0 R >>`
    idsPages.push(idPage)
  }

  objets[idPages] =
    `<< /Type /Pages /Count ${idsPages.length} /Kids [${idsPages.map(i => `${i} 0 R`).join(" ")}] >>`

  let pdf = "%PDF-1.4\n"
  const decalages: number[] = []
  for (let i = 1; i < prochain; i++) {
    decalages[i] = Buffer.byteLength(pdf, "latin1")
    pdf += `${i} 0 obj\n${objets[i]}\nendobj\n`
  }

  const debutXref = Buffer.byteLength(pdf, "latin1")
  pdf += `xref\n0 ${prochain}\n0000000000 65535 f \n`
  for (let i = 1; i < prochain; i++) {
    pdf += `${String(decalages[i]).padStart(10, "0")} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${prochain} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF`

  return Buffer.from(pdf, "latin1")
}
