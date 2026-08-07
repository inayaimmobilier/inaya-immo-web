// ============================================================================
// TARIF D'UN DÉVERROUILLAGE DE CONTACT.
//
// Le prix suit ce que le professionnel espère gagner sur l'affaire, et non une
// grille arbitraire : c'est ce qui rend la dépense acceptable pour lui.
//
//   LOCATION — la commission d'usage est UN MOIS DE LOYER. On prélève
//              `part_pourcent` de ce montant.
//              Loyer 100 000, part 1 %  →  1 000 crédits.
//
//   VENTE    — la commission d'agence est estimée à `taux_commission` % du
//              prix. On prélève `part_pourcent` de cette commission.
//              Prix 8 500 000, commission 5 %, part 10 %  →  42 500 crédits,
//              ramenés au plafond si un plafond est fixé.
//
// Appliquer le pourcentage directement au prix de vente donnerait 85 000 F pour
// une simple mise en relation : hors de proportion avec ce qu'on rend.
//
// 1 crédit = 1 franc CFA.
// ============================================================================

export interface Tarif {
  id: string
  type_offre: "location" | "vente"
  categorie: string | null
  actif: boolean
  taux_commission: number | null
  part_pourcent: number
  cout_min: number
  cout_max: number | null
  cout_defaut: number
}

export interface BienTarifable {
  type_offre: string | null
  categorie: string | null
  prix: number | null
}

export type Calcul =
  | {
      possible: true
      cout: number
      /** Pour expliquer le prix au professionnel avant qu'il ne paie. */
      detail: {
        base: number | null
        commission: number | null
        brut: number | null
        borne: "min" | "max" | "defaut" | null
      }
    }
  | { possible: false; raison: string }

/**
 * Choisit la règle applicable.
 *
 * Une règle portant une catégorie précise l'emporte sur la règle générale du
 * même type d'offre : c'est la seule façon de tarifer un studio autrement
 * qu'une villa sans dupliquer toute la grille.
 */
export function tarifApplicable(tarifs: Tarif[], bien: BienTarifable): Tarif | null {
  const type = bien.type_offre
  if (type !== "location" && type !== "vente") return null

  const candidats = tarifs.filter(t => t.actif && t.type_offre === type)
  return (
    candidats.find(t => t.categorie && t.categorie === bien.categorie) ??
    candidats.find(t => !t.categorie) ??
    null
  )
}

/** Arrondi à la centaine : personne n'annonce un tarif à 1 037 F. */
const arrondir = (n: number) => Math.round(n / 100) * 100

/**
 * Calcule ce que coûte le contact d'un bien.
 *
 * Un bien sans prix exploitable retombe sur `cout_defaut` : sans cela, un prix
 * manquant — fréquent sur les annonces issues de WhatsApp — rendrait le contact
 * gratuit, et le catalogue se viderait sans rien rapporter.
 */
export function calculerCout(tarifs: Tarif[], bien: BienTarifable): Calcul {
  const regle = tarifApplicable(tarifs, bien)
  if (!regle) {
    return {
      possible: false,
      raison: bien.type_offre === "vente"
        ? "La mise en relation n'est pas encore ouverte sur les biens en vente."
        : "La mise en relation n'est pas disponible pour ce type de bien.",
    }
  }

  const prix = typeof bien.prix === "number" && Number.isFinite(bien.prix) && bien.prix > 0
    ? bien.prix : null

  if (prix === null) {
    return {
      possible: true,
      cout: regle.cout_defaut,
      detail: { base: null, commission: null, brut: null, borne: "defaut" },
    }
  }

  // Commission de référence : le loyer mensuel en location, un pourcentage du
  // prix en vente.
  const commission = regle.type_offre === "vente"
    ? prix * ((regle.taux_commission ?? 0) / 100)
    : prix

  const brut = commission * (regle.part_pourcent / 100)

  let cout = arrondir(brut)
  let borne: "min" | "max" | null = null
  if (cout < regle.cout_min) { cout = regle.cout_min; borne = "min" }
  if (regle.cout_max !== null && cout > regle.cout_max) { cout = regle.cout_max; borne = "max" }

  return { possible: true, cout, detail: { base: prix, commission, brut, borne } }
}

/** Formatage homogène des montants, site et application. */
export function formaterCredits(n: number): string {
  return `${n.toLocaleString("fr-FR")} crédit${n > 1 ? "s" : ""}`
}
