// Liste des types de biens — CÔTÉ CLIENT (aucune dépendance serveur).
// Sert de repli si l'admin n'a pas encore personnalisé la liste (app_settings).

export interface PropertyType { code: string; label: string; actif?: boolean }

export const DEFAULT_PROPERTY_TYPES: PropertyType[] = [
  { code: "maison", label: "Maison" },
  { code: "appartement", label: "Appartement" },
  { code: "studio", label: "Studio" },
  { code: "terrain", label: "Terrain" },
  { code: "local_commercial", label: "Local commercial" },
  { code: "bureau", label: "Bureau" },
  { code: "magasin", label: "Magasin" },
  { code: "entrepot", label: "Entrepôt" },
]
