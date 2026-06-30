import { createClient } from "@/lib/supabase/server"
import { formatPrix, formatRelativeDate, TYPE_OFFRE_LABEL } from "@/lib/utils"
import { CheckCircle, XCircle, Eye, Plus, Clock, Globe, Archive, Copy } from "lucide-react"
import Link from "next/link"

const PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{ statut?: string; q?: string; page?: string }>
}

const STATUTS = [
  { value: "",                     label: "Toutes",     icon: null },
  { value: "en_attente_validation", label: "En attente", icon: Clock },
  { value: "publie",               label: "Publiées",   icon: Globe },
  { value: "rejete",               label: "Rejetées",   icon: XCircle },
  { value: "suspendu",             label: "Suspendues", icon: Archive },
]

const STATUT_PILL: Record<string, string> = {
  publie:               "bg-green-50 text-green-700 border-green-100",
  en_attente_validation: "bg-amber-50 text-amber-700 border-amber-100",
  rejete:               "bg-red-50 text-red-700 border-red-100",
  suspendu:             "bg-gray-100 text-gray-500 border-gray-200",
  brouillon:            "bg-gray-50 text-gray-400 border-gray-100",
  reserve:              "bg-indigo-50 text-indigo-700 border-indigo-100",
  conclu:               "bg-purple-50 text-purple-700 border-purple-100",
}

export default async function AnnoncesAdminPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const page = Number(params.page) || 1
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  type PropRow = {
    id: string; titre: string; type_offre: string; categorie: string
    statut: string; prix: number | null; quartier: string | null
    created_at: string; source: string | null
    property_media: { url: string; type: string; ordre: number; thumbnail_url: string | null }[]
  }

  let countQ = supabase.from("properties").select("*", { count: "exact", head: true })
  let dataQ  = supabase.from("properties")
    .select("id,titre,type_offre,categorie,statut,prix,quartier,created_at,source,property_media(url,type,ordre,thumbnail_url)")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (params.statut) { countQ = countQ.eq("statut", params.statut); dataQ = dataQ.eq("statut", params.statut as never) }
  if (params.q)      { countQ = countQ.ilike("titre", `%${params.q}%`); dataQ = dataQ.ilike("titre", `%${params.q}%`) }

  const [{ count }, { data }] = await Promise.all([countQ, dataQ])
  const properties = (data ?? []) as PropRow[]
  const total = count ?? 0
  const totalPages = Math.ceil(total / PER_PAGE)

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ ...params, ...overrides })
    if (!p.get("statut")) p.delete("statut")
    if (!p.get("q")) p.delete("q")
    p.delete("page")
    Object.entries(overrides).forEach(([k, v]) => { if (!v) p.delete(k) })
    return `/admin/annonces?${p.toString()}`
  }

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Annonces</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} annonce{total > 1 ? "s" : ""} au total</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/annonces/doublons"
            className="flex items-center gap-2 bg-white border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-50 transition-colors"
          >
            <Copy className="w-4 h-4" /> Doublons
          </Link>
          <Link
            href="/admin/annonces/nouvelle"
            className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nouvelle annonce
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        {/* Tabs statut */}
        <div className="flex flex-wrap gap-2">
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
        {/* Recherche */}
        <form method="get" action="/admin/annonces" className="flex gap-2">
          {params.statut && <input type="hidden" name="statut" value={params.statut} />}
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Rechercher par titre..."
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Chercher
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {(!properties || properties.length === 0) ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🏠</div>
            <p className="text-gray-500 text-sm">Aucune annonce pour ce filtre.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Annonce</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Prix</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {properties.map((p) => {
                  const media = p.property_media ?? []
                  const thumb = media.filter(m => m.type === "image").sort((a, b) => a.ordre - b.ordre)[0]?.url
                    ?? media.filter(m => m.type === "video" && m.thumbnail_url).sort((a, b) => a.ordre - b.ordre)[0]?.thumbnail_url

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/admin/annonces/${p.id}`} className="flex items-center gap-3 group">
                          {thumb ? (
                            <img src={thumb} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 group-hover:text-blue-700 truncate max-w-[200px]">{p.titre}</p>
                            <p className="text-xs text-gray-400">{p.quartier}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.type_offre === "location" ? "bg-blue-50 text-blue-700"
                          : p.type_offre === "residence_meublee" ? "bg-teal-50 text-teal-700"
                          : p.type_offre === "cession" ? "bg-amber-50 text-amber-700"
                          : "bg-purple-50 text-purple-700"
                        }`}>
                          {TYPE_OFFRE_LABEL[p.type_offre] ?? p.type_offre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 hidden lg:table-cell whitespace-nowrap">
                        {p.prix ? formatPrix(p.prix) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-500 capitalize">{p.source ?? "web"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUT_PILL[p.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {p.statut.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell whitespace-nowrap">
                        {formatRelativeDate(p.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/admin/annonces/${p.id}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Voir / Modérer"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {p.statut === "en_attente_validation" && (
                            <>
                              <form method="post" action={`/api/admin/annonces/${p.id}/approuver`}>
                                <button
                                  type="submit"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                  title="Approuver"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              </form>
                              <form method="post" action={`/api/admin/annonces/${p.id}/rejeter`}>
                                <button
                                  type="submit"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Rejeter"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
