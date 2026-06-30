import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Search, Plus, BellRing } from "lucide-react"
import { formatPrix, formatRelativeDate, CATEGORIE_LABEL } from "@/lib/utils"
import type { RequestStatus, PropertyType, PropertyCat } from "@/types/database"

export const metadata = { title: "Mes recherches · Inaya Immo" }

interface ReqRow {
  id: string; type_offre: PropertyType | null; categories: PropertyCat[] | null
  budget_min: number | null; budget_max: number | null; zones: string[] | null
  description_libre: string | null; statut: RequestStatus; created_at: string
}

const STATUT_PILL: Record<RequestStatus, string> = {
  active: "bg-green-50 text-green-700",
  satisfaite: "bg-blue-50 text-blue-700",
  expiree: "bg-gray-100 text-gray-500",
}
const STATUT_LABEL: Record<RequestStatus, string> = {
  active: "Active", satisfaite: "Satisfaite", expiree: "Expirée",
}

export default async function MesRequetesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from("search_requests")
    .select("id,type_offre,categories,budget_min,budget_max,zones,description_libre,statut,created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
  const reqs = (data ?? []) as ReqRow[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Sauvegardez une recherche : nous vous alertons dès qu&apos;un bien correspondant est publié.
        </p>
        <Link href="/biens" className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors">
          <Plus className="w-4 h-4" /> Nouvelle recherche
        </Link>
      </div>

      {reqs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucune recherche sauvegardée.</p>
          <Link href="/biens" className="inline-block mt-3 text-sm text-blue-700 font-medium hover:text-blue-800">
            Parcourir les annonces →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {reqs.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {r.type_offre === "location" ? "Location" : r.type_offre === "vente" ? "Vente" : "Tous types"}
                    {r.categories?.length ? ` · ${r.categories.map(c => CATEGORIE_LABEL[c]).join(", ")}` : ""}
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUT_PILL[r.statut]}`}>{STATUT_LABEL[r.statut]}</span>
                  {r.statut === "active" && <BellRing className="w-3.5 h-3.5 text-amber-500" aria-label="Alertes actives" />}
                </div>
                <p className="text-xs text-gray-500">
                  {r.zones?.length ? r.zones.join(", ") : "Tous quartiers"}
                  {(r.budget_min || r.budget_max) ? ` · ${r.budget_min ? formatPrix(r.budget_min) : "0"} – ${r.budget_max ? formatPrix(r.budget_max) : "∞"}` : ""}
                </p>
                {r.description_libre && <p className="text-xs text-gray-400 mt-1 truncate">{r.description_libre}</p>}
              </div>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">{formatRelativeDate(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
