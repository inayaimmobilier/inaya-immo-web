import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { formatPrix, STATUT_LABEL, STATUT_COLOR } from "@/lib/utils"
import { Home, PlusCircle, Info, Pencil } from "lucide-react"

export const dynamic = "force-dynamic"

interface PageProps { searchParams: Promise<{ statut?: string }> }

const TABS = [
  { value: "", label: "Toutes" },
  { value: "publie", label: "Disponibles" },
  { value: "en_attente_validation", label: "En attente" },
  { value: "rejete", label: "Rejetées" },
  { value: "expire", label: "Expirées" },
  { value: "suspendu", label: "Suspendues" },
  { value: "reserve", label: "Réservées" },
  { value: "conclu", label: "Conclues" },
]

type PropRow = {
  id: string; reference: number | null; titre: string; type_offre: string; statut: string
  prix: number | null; quartier: string | null; ville: string | null
  created_at: string; rejected_reason: string | null
  ia_moderation_reason: string | null; ia_moderation_decision: string | null
}

export default async function AgentAnnoncesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id ?? ""

  let query = supabase
    .from("properties")
    .select("id,reference,titre,type_offre,statut,prix,quartier,ville,created_at,rejected_reason,ia_moderation_reason,ia_moderation_decision")
    .eq("created_by", uid)
    .order("created_at", { ascending: false })
  if (params.statut) query = query.eq("statut", params.statut as never)

  const { data } = await query
  const biens = (data ?? []) as PropRow[]

  // Raison affichée pour une annonce en attente ou rejetée : priorité au motif
  // manuel de l'admin, puis au motif de la modération IA.
  const raisonDe = (b: PropRow): string | null => {
    if (b.statut !== "rejete" && b.statut !== "en_attente_validation") return null
    if (b.rejected_reason) return b.rejected_reason
    if (b.ia_moderation_reason) return b.ia_moderation_reason
    return b.statut === "en_attente_validation" ? "En cours d'examen par notre équipe." : null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900">Mes annonces ({biens.length})</h2>
        <Link href="/publier" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-xl">
          <PlusCircle className="w-4 h-4" /> Ajouter
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => {
          const active = (params.statut || "") === t.value
          return (
            <a key={t.value || "all"} href={t.value ? `/agent/annonces?statut=${t.value}` : "/agent/annonces"}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                active ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
              }`}>
              {t.label}
            </a>
          )
        })}
      </div>

      {biens.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Home className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">Aucune annonce pour ce filtre.</p>
          <Link href="/publier" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <PlusCircle className="w-4 h-4" /> Publier un bien
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {biens.map(b => {
            const raison = raisonDe(b)
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/biens/${b.id}`} className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">
                      {b.reference != null && <span className="text-blue-700 font-semibold">N°{b.reference} · </span>}{b.titre}
                    </p>
                    <p className="text-xs text-gray-500">
                      {[b.quartier, b.ville].filter(Boolean).join(", ") || "Localisation non précisée"} · {b.prix ? formatPrix(b.prix) : "Prix sur demande"}
                    </p>
                  </Link>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUT_COLOR[b.statut] ?? "bg-gray-100 text-gray-500"}`}>
                    {STATUT_LABEL[b.statut] ?? b.statut}
                  </span>
                  <Link href={`/agent/annonces/${b.id}`}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-lg px-2.5 py-1.5"
                    title="Modifier">
                    <Pencil className="w-3.5 h-3.5" /> Modifier
                  </Link>
                </div>
                {raison && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {raison}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
