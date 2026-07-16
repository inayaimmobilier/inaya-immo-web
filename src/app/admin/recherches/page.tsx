import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Search, BellRing } from "lucide-react"
import type { UserRole } from "@/types/database"
import RecherchesManager, { type SearchRow } from "./RecherchesManager"

export const metadata = { title: "Recherches & alertes · Inaya Immo" }
export const dynamic = "force-dynamic"

const STAFF: UserRole[] = ["super_admin", "admin", "moderateur", "agent"]

interface PageProps { searchParams: Promise<{ statut?: string; q?: string }> }

export default async function RecherchesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/recherches")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (!STAFF.includes(role)) redirect("/admin/dashboard")
  const canDelete = ["super_admin", "admin", "moderateur"].includes(role)

  const admin = createAdminClient()
  // Colonnes SÛRES (présentes depuis la migration 001) — on n'inclut ni `reference`
  // (041) ni `created_by` (042) pour rester fonctionnel si elles ne sont pas encore
  // appliquées.
  let q = admin.from("search_requests")
    .select("id,user_id,contact_nom,contact_telephone,canal,type_offre,categories,budget_min,budget_max,zones,nb_pieces_min,meuble,description_libre,statut,created_at")
    .order("created_at", { ascending: false })
    .limit(500)
  if (params.statut && ["active", "satisfaite", "expiree"].includes(params.statut)) q = q.eq("statut", params.statut)
  const { data } = await q

  type Raw = Omit<SearchRow, "hasAccount"> & { user_id: string | null }
  let raws = (data ?? []) as Raw[]

  // Filtre texte simple (nom / téléphone / quartiers) côté serveur.
  if (params.q?.trim()) {
    const needle = params.q.trim().toLowerCase()
    raws = raws.filter(r =>
      [r.contact_nom, r.contact_telephone, ...(r.zones ?? []), r.description_libre]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(needle)))
  }

  const rows: SearchRow[] = raws.map(r => ({ ...r, hasAccount: !!r.user_id }))

  // Compteurs par statut pour les onglets de filtre.
  const { data: allStatuts } = await admin.from("search_requests").select("statut").limit(2000)
  const counts = { active: 0, satisfaite: 0, expiree: 0 } as Record<string, number>
  for (const s of (allStatuts ?? []) as { statut: string }[]) counts[s.statut] = (counts[s.statut] ?? 0) + 1
  const total = (allStatuts ?? []).length

  const filters: { key: string; label: string; n: number }[] = [
    { key: "", label: "Toutes", n: total },
    { key: "active", label: "Actives", n: counts.active ?? 0 },
    { key: "satisfaite", label: "Satisfaites", n: counts.satisfaite ?? 0 },
    { key: "expiree", label: "Arrêtées", n: counts.expiree ?? 0 },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BellRing className="w-6 h-6 text-blue-600" /> Recherches & alertes clients
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Toutes les recherches sauvegardées (web, app, WhatsApp, créées par le staff). Un bien qui correspond
          alerte automatiquement le client — et vous si vous l&apos;avez créée pour lui.
        </p>
      </div>

      {/* Filtres par statut */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => {
          const active = (params.statut || "") === f.key
          const href = `/admin/recherches${f.key ? `?statut=${f.key}` : ""}`
          return (
            <Link key={f.key || "all"} href={href}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
                active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
              <Search className="w-3.5 h-3.5" /> {f.label} <span className="opacity-70">({f.n})</span>
            </Link>
          )
        })}
      </div>

      <RecherchesManager rows={rows} canDelete={canDelete} />
    </div>
  )
}
