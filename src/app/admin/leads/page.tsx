import { createClient } from "@/lib/supabase/server"
import AutoRefresh from "@/components/shared/AutoRefresh"
import LeadsList, { type LeadItem } from "./LeadsList"

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
  const leadRows = (data ?? []) as LeadRow[]
  const total = count ?? 0
  const totalPages = Math.ceil(total / PER_PAGE)

  // Adapte au format attendu par le composant client (property = 1 objet ou null).
  const leads: LeadItem[] = leadRows.map(l => ({
    id: l.id, statut: l.statut, message: l.message, created_at: l.created_at, canal: l.canal,
    property: l.properties ? { titre: l.properties.titre, quartier: l.properties.quartier } : null,
  }))

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

      {/* Liste + suppression multiple/totale (garde-fous côté composant) */}
      <LeadsList leads={leads} statut={params.statut ?? ""} totalFiltered={total} />

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
