// ============================================================================
// Vocabulaire partagé du module « location de véhicules ».
//
// Les mêmes listes servent au formulaire, à la liste d'administration, à
// l'espace loueur et au catalogue public. Les recopier dans chaque écran aurait
// garanti qu'un jour « SUV » s'appelle « 4x4 » à un endroit et pas à l'autre —
// et les valeurs enregistrées en base sont contraintes par des CHECK, donc un
// libellé qui dérive devient une erreur d'insertion, pas un détail cosmétique.
// ============================================================================

export interface Option { v: string; l: string }

export const TYPES_VEHICULE: Option[] = [
  { v: "citadine", l: "Citadine" },
  { v: "berline", l: "Berline" },
  { v: "suv", l: "SUV / 4x4" },
  { v: "pickup", l: "Pick-up" },
  { v: "utilitaire", l: "Utilitaire" },
  { v: "minibus", l: "Minibus" },
  { v: "van", l: "Van" },
  { v: "luxe", l: "Véhicule de luxe" },
  { v: "autre", l: "Autre" },
]

export const CARBURANTS: Option[] = [
  { v: "essence", l: "Essence" },
  { v: "diesel", l: "Diesel" },
  { v: "hybride", l: "Hybride" },
  { v: "electrique", l: "Électrique" },
  { v: "gpl", l: "GPL" },
  { v: "autre", l: "Autre" },
]

export const BOITES: Option[] = [
  { v: "manuelle", l: "Manuelle" },
  { v: "automatique", l: "Automatique" },
]

export const TRANSMISSIONS: Option[] = [
  { v: "4x2", l: "4x2" },
  { v: "4x4", l: "4x4" },
  { v: "propulsion", l: "Propulsion" },
]

export const STATUTS_VEHICULE: Record<string, { l: string; cls: string }> = {
  disponible: { l: "Disponible", cls: "bg-green-50 text-green-700" },
  loue: { l: "Loué", cls: "bg-blue-50 text-blue-700" },
  reserve: { l: "Réservé", cls: "bg-amber-50 text-amber-700" },
  maintenance: { l: "En maintenance", cls: "bg-orange-50 text-orange-700" },
  indisponible: { l: "Indisponible", cls: "bg-gray-100 text-gray-600" },
  archive: { l: "Archivé", cls: "bg-gray-100 text-gray-400" },
}

export const TYPES_DOCUMENT: Option[] = [
  { v: "carte_grise", l: "Carte grise" },
  { v: "assurance", l: "Assurance" },
  { v: "visite_technique", l: "Visite technique" },
  { v: "controle_technique", l: "Contrôle technique" },
  { v: "titre_propriete", l: "Titre de propriété" },
  { v: "contrat_acquisition", l: "Contrat d'acquisition" },
  { v: "autre", l: "Autre" },
]

/** Prises de vue attendues, dans l'ordre où un agent les fait naturellement. */
export const EMPLACEMENTS_PHOTO: string[] = [
  "Principale", "Avant", "Arrière", "Côté gauche", "Côté droit",
  "Intérieur avant", "Intérieur arrière", "Tableau de bord", "Coffre",
  "Moteur", "Pneus", "Défaut constaté",
]

/** Frais proposés par défaut — l'admin peut en ajouter d'autres. */
export const FRAIS_COURANTS: Option[] = [
  { v: "livraison", l: "Livraison" },
  { v: "recuperation", l: "Récupération" },
  { v: "nettoyage", l: "Nettoyage" },
  { v: "carburant", l: "Carburant" },
  { v: "retard", l: "Retard" },
  { v: "km_supplementaire", l: "Kilométrage supplémentaire" },
  { v: "conducteur_supplementaire", l: "Conducteur supplémentaire" },
  { v: "jeune_conducteur", l: "Jeune conducteur" },
  { v: "reservation", l: "Réservation" },
]

export const UNITES_FRAIS: Option[] = [
  { v: "forfait", l: "Forfait" },
  { v: "par_jour", l: "Par jour" },
  { v: "par_km", l: "Par km" },
  { v: "par_heure", l: "Par heure" },
  { v: "pourcentage", l: "% du total" },
]

/** Les 8 étapes du formulaire, dans l'ordre de saisie sur le terrain. */
export const ETAPES = [
  "Identification", "Caractéristiques", "Équipements", "Photos",
  "Tarification", "Conditions", "Documents", "Disponibilité",
] as const

export interface TarifPalier {
  jour_min: number
  jour_max: number | null
  prix_jour: number
}

export interface FraisLigne {
  code: string
  libelle: string
  montant: number
  unite: string
}

export interface PhotoLigne {
  url: string
  emplacement: string
  principale: boolean
}

export interface DocumentLigne {
  type: string
  numero: string
  date_emission: string
  date_expiration: string
  fichier_url: string
}

/** Tout ce qu'un formulaire de véhicule transporte, formulaire → serveur. */
export interface VehiculeInput {
  loueur_id: string
  agence_id?: string | null
  statut: string
  publie: boolean

  type_vehicule: string
  marque: string
  modele: string
  finition?: string | null
  annee_fabrication?: number | null
  annee_circulation?: number | null
  couleur?: string | null
  immatriculation?: string | null
  vin?: string | null
  numero_serie?: string | null
  kilometrage?: number | null
  date_acquisition?: string | null
  description?: string | null

  carburant?: string | null
  cylindree?: number | null
  puissance_ch?: number | null
  nb_cylindres?: number | null
  boite?: string | null
  nb_rapports?: number | null
  transmission?: string | null
  consommation?: number | null
  nb_places?: number | null
  nb_portes?: number | null
  volume_coffre?: number | null
  capacite_reservoir?: number | null
  charge_utile?: number | null

  prix_heure?: number | null
  prix_jour?: number | null
  prix_semaine?: number | null
  prix_mois?: number | null

  km_inclus_jour?: number | null
  km_inclus_semaine?: number | null
  km_inclus_mois?: number | null
  prix_km_supp?: number | null
  depot_garantie?: number | null
  franchise?: number | null
  age_min_conducteur?: number | null
  anciennete_permis?: number | null
  nb_conducteurs_max?: number | null
  sortie_territoire: boolean
  sortie_ville: boolean
  transport_marchandises: boolean
  animaux_autorises: boolean
  fumeur_autorise: boolean
  usage_commercial: boolean

  ville?: string | null
  quartier?: string | null
  adresse?: string | null
  video_url?: string | null
  notes_internes?: string | null

  equipements: string[]
  tarifs: TarifPalier[]
  frais: FraisLigne[]
  photos: PhotoLigne[]
  documents: DocumentLigne[]
}

/** Valeurs de départ d'une fiche neuve. */
export function vehiculeVide(loueurId = ""): VehiculeInput {
  return {
    loueur_id: loueurId, agence_id: null, statut: "indisponible", publie: false,
    type_vehicule: "berline", marque: "", modele: "", finition: "",
    annee_fabrication: null, annee_circulation: null, couleur: "",
    immatriculation: "", vin: "", numero_serie: "", kilometrage: null,
    date_acquisition: "", description: "",
    carburant: "essence", cylindree: null, puissance_ch: null, nb_cylindres: null,
    boite: "manuelle", nb_rapports: null, transmission: "4x2", consommation: null,
    nb_places: 5, nb_portes: 5, volume_coffre: null, capacite_reservoir: null,
    charge_utile: null,
    prix_heure: null, prix_jour: null, prix_semaine: null, prix_mois: null,
    km_inclus_jour: null, km_inclus_semaine: null, km_inclus_mois: null,
    prix_km_supp: null, depot_garantie: null, franchise: null,
    age_min_conducteur: 21, anciennete_permis: 2, nb_conducteurs_max: 1,
    sortie_territoire: false, sortie_ville: true, transport_marchandises: false,
    animaux_autorises: false, fumeur_autorise: false, usage_commercial: false,
    ville: "Bouaké", quartier: "", adresse: "", video_url: "", notes_internes: "",
    equipements: [], tarifs: [], frais: [], photos: [], documents: [],
  }
}

/**
 * Prix applicable pour une durée donnée.
 *
 * Les paliers priment sur le prix journalier de base : c'est leur raison
 * d'être. Sans palier correspondant, on retombe sur `prix_jour`, sinon un
 * véhicule sans grille dégressive n'aurait aucun prix du tout.
 */
export function prixPourDuree(
  jours: number, tarifs: TarifPalier[], prixJour: number | null,
): number | null {
  const palier = tarifs
    .filter(t => jours >= t.jour_min && (t.jour_max == null || jours <= t.jour_max))
    // Le palier le plus précis gagne : deux grilles qui se chevauchent sont une
    // erreur de saisie, mais elle ne doit pas produire un prix au hasard.
    .sort((a, b) => b.jour_min - a.jour_min)[0]
  return palier ? palier.prix_jour : prixJour
}
