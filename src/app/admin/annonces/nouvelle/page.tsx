import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, PlusCircle } from "lucide-react"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import PublierForm from "@/app/(public)/publier/PublierForm"
import type { UserRole } from "@/types/database"

// ============================================================================
// CRÉATION D'UNE ANNONCE DEPUIS L'ADMINISTRATION.
//
// Le bouton « Nouvelle annonce » de /admin/annonces pointait vers cette adresse
// depuis toujours, mais la page n'avait jamais été écrite : le bouton menait à
// un 404. Un bouton mort dans un back-office est pire qu'une fonction absente —
// on croit pouvoir faire quelque chose, on essaie, et on perd sa saisie.
//
// On RÉUTILISE `PublierForm`, le formulaire public, qui prévoyait déjà un mode
// `isStaff` (saisie des coordonnées du propriétaire réel pour le compte de
// quelqu'un). Le dupliquer aurait fait diverger les deux formulaires dès la
// première évolution — un champ ajouté d'un côté, oublié de l'autre.
// ============================================================================

export const metadata = { title: "Nouvelle annonce · Inaya Immo" }
export const dynamic = "force-dynamic"

const AUTORISES: UserRole[] = ["super_admin", "admin", "moderateur", "agent"]

export default async function NouvelleAnnoncePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")

  const { data: prof } = await supabase
    .from("profiles").select("nom, prenom, telephone, role").eq("id", user.id).maybeSingle()
  const p = prof as { nom: string | null; prenom: string | null; telephone: string | null; role: UserRole | null } | null
  if (!p?.role || !AUTORISES.includes(p.role)) redirect("/admin")

  const { data: villesData } = await createAdminClient()
    .from("villes").select("id,nom").eq("actif", true).order("ordre").order("nom")
  const villes = (villesData ?? []) as { id: string; nom: string }[]

  // Coordonnées du compte connecté : le membre du staff est le publieur, et
  // les coordonnées du propriétaire réel se saisissent à part (mode `isStaff`).
  const nomComplet = `${p.prenom || ""} ${p.nom || ""}`.trim() || null

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/admin/annonces"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Retour aux annonces
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PlusCircle className="w-6 h-6 text-blue-600" /> Nouvelle annonce
        </h1>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          L&apos;annonce est créée <strong>en attente de validation</strong>, comme celles qui
          arrivent des groupes WhatsApp. Vous la publiez ensuite d&apos;un clic depuis la liste
          des annonces — ce passage garantit qu&apos;aucune fiche ne part en ligne sans une
          relecture.
        </p>
      </div>

      <PublierForm
        villes={villes}
        initialContact={{ nom: nomComplet, telephone: p.telephone || null }}
        isStaff
      />
    </div>
  )
}
