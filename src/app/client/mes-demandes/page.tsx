import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { MessageSquare } from "lucide-react"
import { formatRelativeDate } from "@/lib/utils"
import type { LeadStatus } from "@/types/database"

export const metadata = { title: "Mes demandes · Inaya Immo" }

interface LeadRow {
  id: string; statut: LeadStatus; message: string | null; created_at: string
  properties: { id: string; titre: string; quartier: string | null } | null
}

const STATUT_PILL: Record<LeadStatus, string> = {
  nouveau:           "bg-blue-50 text-blue-700",
  en_traitement:     "bg-indigo-50 text-indigo-700",
  contacte:          "bg-cyan-50 text-cyan-700",
  visite_planifiee:  "bg-violet-50 text-violet-700",
  visite_effectuee:  "bg-teal-50 text-teal-700",
  paiement_planifie: "bg-purple-50 text-purple-700",
  conclu:            "bg-green-50 text-green-700",
  abandonne:         "bg-gray-100 text-gray-500",
}
const STATUT_LABEL: Record<LeadStatus, string> = {
  nouveau: "Reçue", en_traitement: "En traitement", contacte: "Contacté",
  visite_planifiee: "Visite planifiée", visite_effectuee: "Visite effectuée",
  paiement_planifie: "Paiement prévu",
  conclu: "Conclue", abandonne: "Abandonnée",
}

export default async function MesDemandesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from("leads")
    .select("id,statut,message,created_at,properties(id,titre,quartier)")
    .eq("client_id", user!.id)
    .order("created_at", { ascending: false })
  const leads = (data ?? []) as unknown as LeadRow[]

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Suivez l&apos;avancement de vos demandes de visite.</p>

      {leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Vous n&apos;avez pas encore fait de demande.</p>
          <Link href="/biens" className="inline-block mt-3 text-sm text-blue-700 font-medium hover:text-blue-800">
            Voir les annonces →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(l => (
            <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                {l.properties ? (
                  <Link href={`/biens/${l.properties.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-700 transition-colors">
                    {l.properties.titre}
                  </Link>
                ) : <span className="text-sm font-medium text-gray-900">Annonce</span>}
                <p className="text-xs text-gray-400 mt-0.5">{l.properties?.quartier ?? ""}</p>
                {l.message && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{l.message}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUT_PILL[l.statut]}`}>{STATUT_LABEL[l.statut]}</span>
                <p className="text-[11px] text-gray-400 mt-1">{formatRelativeDate(l.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
