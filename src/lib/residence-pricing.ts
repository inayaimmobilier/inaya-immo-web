// ============================================================================
// Calcul du tarif d'un séjour en résidence meublée (partagé client + serveur).
// Gère le nombre de nuits, la période (nuit/semaine/mois) et les forfaits
// spéciaux écrits en texte libre par l'annonceur.
// ============================================================================

export const onlyDigits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0

export function nuitsBetween(aIso: string, dIso: string): number {
  return Math.max(0, Math.round((new Date(dIso).getTime() - new Date(aIso).getTime()) / 86_400_000))
}

/** Nombre de nuits depuis un libellé « Du JJ/MM/AAAA au JJ/MM/AAAA ». */
export function nuitsFromSejour(souhaite: string | null | undefined): number {
  if (!souhaite) return 0
  const dates = [...souhaite.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(m => `${m[3]}-${m[2]}-${m[1]}`)
  return dates.length >= 2 ? nuitsBetween(dates[0], dates[1]) : 0
}

/** Meilleur forfait applicable trouvé dans le texte (description/forfaits). */
export function bestForfait(text: string | null | undefined, nuits: number, base: number): { total: number; note: string } | null {
  if (!text) return null
  const cands: { total: number; note: string }[] = []

  const reSeuil = /(\d[\d\s.]{2,})\s*(?:f|fcfa|francs?)?[^\d]{0,25}?à\s*partir\s*de\s*(\d+)\s*(?:nuit|jour|nuitée)/gi
  let m: RegExpExecArray | null
  while ((m = reSeuil.exec(text))) {
    const tarif = onlyDigits(m[1]); const seuil = Number(m[2])
    if (tarif > 0 && seuil > 0 && nuits >= seuil) cands.push({ total: tarif * nuits, note: `Forfait dès ${seuil} nuits : ${tarif.toLocaleString("fr-FR")} FCFA/nuit` })
  }
  const rePack = /(\d+)\s*(?:nuit|jour|nuitée)s?\s*(?:à\s*|=\s*|:\s*|pour\s*|-\s*)(\d[\d\s.]{2,})/gi
  while ((m = rePack.exec(text))) {
    const n = Number(m[1]); const prix = onlyDigits(m[2])
    if (n > 0 && prix > 0 && nuits >= n) {
      const extra = (nuits - n) * base
      cands.push({ total: prix + extra, note: `Forfait ${n} nuits (${prix.toLocaleString("fr-FR")} FCFA)${extra > 0 ? ` + ${nuits - n} nuit(s)` : ""}` })
    }
  }
  return cands.length ? cands.reduce((a, b) => (b.total < a.total ? b : a)) : null
}

export interface SejourEstimate { nuits: number; base: number; total: number; forfait: { total: number; note: string } | null; baseNote: string }

/** Estimation complète d'un séjour. */
export function estimateSejour(nuits: number, prix: number, periode: string | null, forfaits: string | null): SejourEstimate | null {
  if (nuits <= 0 || !prix) return null
  const p = periode || "nuit"
  let base: number, baseNote: string
  if (p === "semaine") { const w = Math.max(1, Math.ceil(nuits / 7)); base = w * prix; baseNote = `${w} semaine${w > 1 ? "s" : ""} × ${prix.toLocaleString("fr-FR")} (${nuits} nuits)` }
  else if (p === "mois") { const mo = Math.max(1, Math.ceil(nuits / 30)); base = mo * prix; baseNote = `${mo} mois × ${prix.toLocaleString("fr-FR")} (${nuits} nuits)` }
  else { base = nuits * prix; baseNote = `${nuits} nuit${nuits > 1 ? "s" : ""} × ${prix.toLocaleString("fr-FR")} FCFA` }
  const f = p === "nuit" ? bestForfait(forfaits, nuits, prix) : null
  const applied = f && f.total < base ? f : null
  return { nuits, base, baseNote, total: applied ? applied.total : base, forfait: applied }
}
