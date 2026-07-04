import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrix(prix: number): string {
  return new Intl.NumberFormat("fr-CI", {
    style: "currency",
    currency: "XOF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(prix)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("fr-CI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date))
}

/** Date + heure, ex: « 22 juin 2026 à 14:30 ». */
export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  const jour = new Intl.DateTimeFormat("fr-CI", { day: "numeric", month: "long", year: "numeric" }).format(d)
  const heure = new Intl.DateTimeFormat("fr-CI", { hour: "2-digit", minute: "2-digit" }).format(d)
  return `${jour} à ${heure}`
}

export function formatRelativeDate(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "À l'instant"
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return formatDate(date)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export const TYPE_OFFRE_LABEL: Record<string, string> = {
  location: "Location",
  vente: "Vente",
  cession: "Cession",
  residence_meublee: "Résidence meublée",
}

export const CATEGORIE_LABEL: Record<string, string> = {
  maison: "Maison",
  appartement: "Appartement",
  studio: "Studio",
  terrain: "Terrain",
  local_commercial: "Local commercial",
  bureau: "Bureau",
  magasin: "Magasin",
  autre: "Autre",
}

export const STATUT_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  en_attente_validation: "En attente",
  publie: "Publié",
  reserve: "Réservé",
  conclu: "Conclu",
  rejete: "Rejeté",
  expire: "Expiré",
  suspendu: "Suspendu",
}

// Cycle de vie d'un lead (demande de visite / mise en relation)
export const LEAD_STATUT_LABEL: Record<string, string> = {
  nouveau:           "Nouveau",
  en_traitement:     "En cours de traitement",
  contacte:          "Client contacté",
  visite_planifiee:  "Visite planifiée",
  visite_effectuee:  "Visite effectuée",
  paiement_planifie: "RDV paiement",
  conclu:            "Conclu",
  abandonne:         "Abandonné",
}

export const LEAD_STATUT_COLOR: Record<string, string> = {
  nouveau:           "bg-blue-50 text-blue-700 border-blue-100",
  en_traitement:     "bg-indigo-50 text-indigo-700 border-indigo-100",
  contacte:          "bg-cyan-50 text-cyan-700 border-cyan-100",
  visite_planifiee:  "bg-amber-50 text-amber-700 border-amber-100",
  visite_effectuee:  "bg-orange-50 text-orange-700 border-orange-100",
  paiement_planifie: "bg-violet-50 text-violet-700 border-violet-100",
  conclu:            "bg-green-50 text-green-700 border-green-100",
  abandonne:         "bg-gray-100 text-gray-500 border-gray-200",
}

export const STATUT_COLOR: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  en_attente_validation: "bg-yellow-100 text-yellow-800",
  publie: "bg-green-100 text-green-800",
  reserve: "bg-blue-100 text-blue-800",
  conclu: "bg-purple-100 text-purple-800",
  rejete: "bg-red-100 text-red-800",
  expire: "bg-gray-100 text-gray-500",
  suspendu: "bg-orange-100 text-orange-800",
}

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrateur",
  moderateur: "Modérateur",
  agent: "Agent immobilier",
  comptable: "Comptable",
  proprietaire: "Propriétaire",
  locataire: "Locataire",
  prestataire: "Prestataire",
  apporteur: "Apporteur",
  client: "Chercheur",
}

export const ROLE_COLOR: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  moderateur: "bg-indigo-100 text-indigo-800",
  agent: "bg-amber-100 text-amber-800",
  comptable: "bg-cyan-100 text-cyan-800",
  proprietaire: "bg-emerald-100 text-emerald-800",
  locataire: "bg-teal-100 text-teal-800",
  prestataire: "bg-orange-100 text-orange-800",
  apporteur: "bg-pink-100 text-pink-800",
  client: "bg-gray-100 text-gray-600",
}

export const USER_STATUS_LABEL: Record<string, string> = {
  actif: "Actif",
  suspendu: "Suspendu",
  banni: "Banni",
}

export const USER_STATUS_COLOR: Record<string, string> = {
  actif: "bg-green-100 text-green-800",
  suspendu: "bg-orange-100 text-orange-800",
  banni: "bg-red-100 text-red-800",
}
