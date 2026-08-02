import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { analyserDemande } from "@/lib/demande-completude"
import { chargerVocabulaireLieux } from "@/lib/vocabulaire-lieux"
import type { UserRole } from "@/types/database"
import ValidationManager, { type DemandeAValider } from "./ValidationManager"

export const metadata = { title: "Validation des demandes · Inaya Immo" }
export const dynamic = "force-dynamic"

const VALIDATEURS: UserRole[] = ["super_admin", "admin", "moderateur"]

export default async function ValidationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  if (!role || !VALIDATEURS.includes(role)) redirect("/admin")

  const admin = createAdminClient()
  const vocab = await chargerVocabulaireLieux()

  // Les plus anciennes d'abord : ce sont celles qui attendent depuis le plus
  // longtemps, donc les clients les plus près de se lasser.
  const { data } = await admin.from("search_requests")
    .select("*")
    .eq("statut", "active")
    .eq("statut_validation", "a_valider")
    .order("created_at", { ascending: true })
    .range(0, 199)

  type Ligne = {
    id: string; reference: number | null; contact_nom: string | null
    contact_telephone: string | null; canal: string | null
    type_offre: string | null; categories: string[] | null; commune: string | null
    zones: string[] | null; budget_min: number | null; budget_max: number | null
    nb_pieces_min: number | null; description_libre: string | null; created_at: string
  }

  const demandes: DemandeAValider[] = ((data ?? []) as Ligne[]).map(r => {
    // Le formulaire s'ouvre PRÉ-REMPLI de ce que l'analyse a su établir : le
    // modérateur corrige au lieu de tout ressaisir. C'est la différence entre
    // quelques secondes et une minute par demande — sur des centaines, c'est ce
    // qui décide si le travail se fait ou non.
    const a = analyserDemande(r as never, vocab)
    return {
      id: r.id,
      reference: r.reference,
      contactNom: r.contact_nom,
      contactTelephone: r.contact_telephone,
      canal: r.canal,
      texte: r.description_libre,
      creeLe: r.created_at,
      manquants: a.manquants,
      propose: {
        type_offre: a.resolus.type_offre,
        categories: a.resolus.categories,
        commune: a.resolus.commune,
        zones: a.resolus.quartiers,
        budget_max: r.budget_max ?? a.resolus.budget,
        nb_pieces_min: a.resolus.nb_pieces_min,
      },
    }
  })

  const { count: total } = await admin.from("search_requests")
    .select("id", { count: "exact", head: true })
    .eq("statut", "active").eq("statut_validation", "a_valider")

  const { count: completes } = await admin.from("search_requests")
    .select("id", { count: "exact", head: true })
    .eq("statut", "active").in("statut_validation", ["complete", "validee"])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-amber-600" /> Validation des demandes
        </h1>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Une demande dont un critère clé n&apos;est pas établi <strong>n&apos;envoie aucune
          alerte</strong> tant qu&apos;elle n&apos;a pas été vérifiée ici. Corrigez ce qui manque,
          puis validez : le client recevra aussitôt les biens correspondants, y compris ceux
          publiés pendant l&apos;attente.
        </p>
      </div>

      <ValidationManager
        demandes={demandes}
        totalEnAttente={total ?? 0}
        totalActives={completes ?? 0}
        communes={vocab.communes}
      />
    </div>
  )
}
