import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { formatRelativeDate, LEAD_STATUT_LABEL } from "@/lib/utils"
import { MessageSquare, ChevronRight } from "lucide-react"
import AutoRefresh from "@/components/shared/AutoRefresh"

// Données temps réel (ingestion WhatsApp) : jamais de cache, toujours frais.
export const dynamic = "force-dynamic"

const PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{ statut?: string; page?: string }>
}

const STATUTS = [
  { value: "",             label: "Tous" },
  { value: "nouveau",      label: "Nouveaux" },
  { value: "en_traitement", label: "En cours" },
  { value: "conclu",       label: "Conclus" },
  { value: "abandonne",    label: "Abandonnés" },
]

const STATUT_PILL: Record<string, string> = {
  nouveau:       "bg-blue-50 text-blue-700 border-blue-100",
  en_traitement: "bg-indigo-50 text-indigo-700 border-indigo-100",
  contacte:      "bg-cyan-50 text-cyan-700 border-cyan-100",
  visite_planifiee:  "bg-amber-50 text-amber-700 border-amber-100",
  visite_effectuee:  "bg-orange-50 text-orange-700 border-orange-100",
  conclu:        "bg-green-50 text-green-700 border-green-100",
  abandonne:     "bg-gray-100 text-gray-500 border-gray-200",
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const page = Number(params.page) || 1
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  type LeadRow = {
    id: string; statut: string; message: string | null
    created_at: string; canal: string
    properties: { id: string; titre: string; quartier: string | null } | null
  }

  let countQ = supabase.from("leads").select("*", { count: "exact", head: true })
  let dataQ  = supabase.from("leads")
    .select("id,statut,message,created_at,canal,properties(id,titre,quartier)")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (params.statut) { countQ = countQ.eq("statut", params.statut); dataQ = dataQ.eq("statut", params.statut as never) }

  const [{ count }, { data }] = await Promise.all([countQ, dataQ])
  const leads = (data ?? []) as LeadRow[]
  const total = count ?? 0
  const totalPages = Math.ceil(total / PER_PAGE)

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ ...params, ...overrides })
    if (!p.get("statut")) p.delete("statut")
    p.delete("page")
    Object.entries(overrides).forEach(([k, v]) => { if (!v) p.delete(k) })
    return `/admin/leads?${p.toString()}`
  }

  return (
    <div className="p-6 space-y-6">
      <AutoRefresh intervalMs={20_000} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} lead{total > 1 ? "s" : ""}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUTS.map(({ value, label }) => {
          const active = (params.statut ?? "") === value
          return (
            <a
              key={value}
              href={buildUrl({ statut: value, page: "1" })}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                active
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              }`}
            >
              {label}
            </a>
          )
        })}
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {(!leads || leads.length === 0) ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-gray-500 text-sm">Aucun lead pour ce filtre.</p>
          </div>
        ) : leads.map((l) => {
          const property = l.properties
          return (
            <Link
              key={l.id}
              href={`/admin/leads/${l.id}`}
              className="block bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm hover:border-blue-200 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-xl bg-indigo-50">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">Demande de visite</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUT_PILL[l.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {LEAD_STATUT_LABEL[l.statut] ?? l.statut}
                    </span>
                    {l.canal && (
                      <span className="text-xs text-gray-400 capitalize">via {l.canal}</span>
                    )}
                  </div>
                  {property && (
                    <p className="text-xs text-gray-500 mt-1">
                      Annonce : <span className="text-gray-700 font-medium">{property.titre}</span>
                      {property.quartier ? ` · ${property.quartier}` : ""}
                    </p>
                  )}
                  {l.message && (
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed line-clamp-2">{l.message}</p>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2 text-right">
                  <p className="text-xs text-gray-400">{formatRelativeDate(l.created_at)}</p>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={buildUrl({ page: String(p) })}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                p === page
                  ? "bg-blue-700 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
