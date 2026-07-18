import { createClient, createAdminClient } from "@/lib/supabase/server"
import { XCircle, Plus, Clock, Globe, Archive, Copy, Flag } from "lucide-react"
import Link from "next/link"
import AutoRefresh from "@/components/shared/AutoRefresh"
import ModerationTable, { type AnnonceRow } from "./ModerationTable"

// Données temps réel (ingestion WhatsApp) : jamais de cache, toujours frais.
export const dynamic = "force-dynamic"

const PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{ statut?: string; q?: string; page?: string; signalees?: string }>
}

const STATUTS = [
  { value: "",                     label: "Toutes",     icon: null },
  { value: "en_attente_validation", label: "En attente", icon: Clock },
  { value: "publie",               label: "Publiées",   icon: Globe },
  { value: "rejete",               label: "Rejetées",   icon: XCircle },
  { value: "suspendu",             label: "Suspendues", icon: Archive },
]

export default async function AnnoncesAdminPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const page = Number(params.page) || 1
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  type PropRow = {
    id: string; reference: number | null; titre: string; description: string | null; type_offre: string; categorie: string
    statut: string; prix: number | null; quartier: string | null
    created_at: string; source: string | null
    property_media: { url: string; type: string; ordre: number; thumbnail_url: string | null }[]
  }

  // Signalements ouverts (résilient si migration 031 non appliquée → aucun).
  const adminDb = createAdminClient()
  const reportCount = new Map<string, number>()
  {
    const { data: sigs, error: sigErr } = await adminDb
      .from("signalements").select("property_id").eq("statut", "nouveau")
    if (!sigErr && sigs) {
      for (const s of sigs as { property_id: string }[]) {
        reportCount.set(s.property_id, (reportCount.get(s.property_id) ?? 0) + 1)
      }
    }
  }
  const reportedIds = [...reportCount.keys()]
  const signaleesActive = params.signalees === "1"

  const SELECT = "id,reference,titre,description,type_offre,categorie,statut,prix,quartier,created_at,source,property_media(url,type,ordre,thumbnail_url)"
  const dummyIds = ["00000000-0000-0000-0000-000000000000"]

  let properties: PropRow[]
  let total: number
  let totalPages: number

  if (params.q) {
    // Recherche LARGE : n'importe quel texte de l'annonce (titre / description /
    // quartier), le NUMÉRO d'annonce (INA-XXXXXX) ou l'identifiant. Filtrage en JS
    // (accents/casse ignorés) pour couvrir tous les cas de façon fiable.
    const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    const t = norm(params.q).trim()
    // NUMÉRO d'annonce (le même que côté client) : « N°601 », « #601 » ou « 601 ».
    const numPart = t.replace(/^n[°o]?\s*|^#\s*|^numero\s*/, "").trim()
    const asRef = /^\d+$/.test(numPart) ? Number(numPart) : null
    // Repli : ancien identifiant hex (« A3D855 » / UUID) pour les liens existants.
    const hex = params.q.replace(/[^0-9a-zA-Z]/g, "").toLowerCase().replace(/^ina/, "")

    let sq = supabase.from("properties").select(SELECT).order("created_at", { ascending: false }).limit(2000)
    if (params.statut) sq = sq.eq("statut", params.statut as never)
    if (signaleesActive) sq = sq.in("id", reportedIds.length ? reportedIds : dummyIds)

    // Le NUMÉRO est cherché DIRECTEMENT en base (pas seulement dans la fenêtre
    // des 2000 annonces récentes du filtre texte) : une annonce ancienne — ex.
    // N°1619 — doit TOUJOURS être retrouvable par son numéro, c'est le moyen de
    // recontacter le propriétaire quand un client est intéressé.
    let rq = asRef != null
      ? supabase.from("properties").select(SELECT).eq("reference", asRef).limit(5)
      : null
    if (rq && params.statut) rq = rq.eq("statut", params.statut as never)
    if (rq && signaleesActive) rq = rq.in("id", reportedIds.length ? reportedIds : dummyIds)

    const [{ data }, refRes] = await Promise.all([sq, rq ?? Promise.resolve({ data: null })])
    const all = (data ?? []) as PropRow[]
    const refRows = ((refRes as { data: PropRow[] | null }).data ?? [])

    const filtered = all.filter(p => {
      if (asRef != null && p.reference === asRef) return true
      if (t && (norm(p.titre).includes(t) || norm(p.description).includes(t) || norm(p.quartier).includes(t))) return true
      const idHex = p.id.replace(/-/g, "").toLowerCase()
      if (asRef == null && hex.length >= 4 && (idHex.startsWith(hex) || idHex.includes(hex))) return true
      return false
    })
    // Fusion : correspondances par numéro D'ABORD, sans doublon.
    const seen = new Set(refRows.map(p => p.id))
    const merged = [...refRows, ...filtered.filter(p => !seen.has(p.id))]
    total = merged.length
    totalPages = Math.ceil(total / PER_PAGE)
    properties = merged.slice(from, to + 1)
  } else {
    let countQ = supabase.from("properties").select("*", { count: "exact", head: true })
    let dataQ = supabase.from("properties").select(SELECT).order("created_at", { ascending: false }).range(from, to)
    if (params.statut) { countQ = countQ.eq("statut", params.statut); dataQ = dataQ.eq("statut", params.statut as never) }
    if (signaleesActive) {
      const ids = reportedIds.length ? reportedIds : dummyIds
      countQ = countQ.in("id", ids); dataQ = dataQ.in("id", ids)
    }
    const [{ count }, { data }] = await Promise.all([countQ, dataQ])
    properties = (data ?? []) as PropRow[]
    total = count ?? 0
    totalPages = Math.ceil(total / PER_PAGE)
  }

  // Données sérialisables pour le tableau interactif (sélection + modération groupée).
  const rows: AnnonceRow[] = properties.map(p => {
    const media = p.property_media ?? []
    const thumb = media.filter(m => m.type === "image").sort((a, b) => a.ordre - b.ordre)[0]?.url
      ?? media.filter(m => m.type === "video" && m.thumbnail_url).sort((a, b) => a.ordre - b.ordre)[0]?.thumbnail_url
      ?? null
    return {
      id: p.id, reference: p.reference, titre: p.titre, type_offre: p.type_offre, categorie: p.categorie, statut: p.statut,
      prix: p.prix, quartier: p.quartier, source: p.source, created_at: p.created_at,
      thumb, reported: reportCount.get(p.id) ?? 0,
    }
  })

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ ...params, ...overrides })
    if (!p.get("statut")) p.delete("statut")
    if (!p.get("q")) p.delete("q")
    if (!p.get("signalees")) p.delete("signalees")
    p.delete("page")
    Object.entries(overrides).forEach(([k, v]) => { if (!v) p.delete(k) })
    return `/admin/annonces?${p.toString()}`
  }

  return (
    <div className="p-6 space-y-6">
      <AutoRefresh intervalMs={20_000} />
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
            const active = !signaleesActive && (params.statut ?? "") === value
            return (
              <a
                key={value}
                href={buildUrl({ statut: value, signalees: "", page: "1" })}
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
          {/* Onglet signalées — mis en avant en rouge */}
          {reportedIds.length > 0 && (
            <a
              href={signaleesActive ? buildUrl({ signalees: "", page: "1" }) : buildUrl({ signalees: "1", statut: "", page: "1" })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                signaleesActive
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-700 border-red-200 hover:border-red-400"
              }`}
            >
              <Flag className="w-3.5 h-3.5" /> Signalées ({reportedIds.length})
            </a>
          )}
        </div>
        {/* Recherche */}
        <form method="get" action="/admin/annonces" className="flex gap-2">
          {params.statut && <input type="hidden" name="statut" value={params.statut} />}
          {signaleesActive && <input type="hidden" name="signalees" value="1" />}
          <input
            name="q"
            defaultValue={params.q}
            placeholder="N° d'annonce (ex : 601), texte, quartier…"
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

      {/* Table interactive : sélection + modération groupée (publier / rejeter) */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <div className="text-4xl mb-3">🏠</div>
          <p className="text-gray-500 text-sm">Aucune annonce pour ce filtre.</p>
        </div>
      ) : (
        <ModerationTable rows={rows} />
      )}

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
