import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { STATUT_LABEL } from "@/lib/utils"
import { Home, PlusCircle, CheckCircle2, Clock, XCircle, CalendarX2 } from "lucide-react"

export const dynamic = "force-dynamic"

const KPI_STATUTS = [
  { statut: "publie", label: "Disponibles", icon: CheckCircle2, color: "text-green-600 bg-green-50" },
  { statut: "en_attente_validation", label: "En attente", icon: Clock, color: "text-amber-600 bg-amber-50" },
  { statut: "rejete", label: "Rejetées", icon: XCircle, color: "text-red-600 bg-red-50" },
  { statut: "expire", label: "Expirées", icon: CalendarX2, color: "text-gray-500 bg-gray-100" },
]

export default async function AgentDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id ?? ""

  const { data } = await supabase.from("properties").select("statut").eq("created_by", uid)
  const rows = (data ?? []) as { statut: string }[]
  const total = rows.length
  const countOf = (s: string) => rows.filter(r => r.statut === s).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {KPI_STATUTS.map(({ statut, label, icon: Icon, color }) => (
          <div key={statut} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>
              <Icon className="w-4.5 h-4.5" />
            </div>
            <p className="text-lg font-bold text-gray-900 leading-tight">{countOf(statut)}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Vos annonces</h2>
          <p className="text-sm text-gray-500">
            {total} annonce{total > 1 ? "s" : ""} au total{" "}
            <span className="text-gray-400">— {STATUT_LABEL.publie} : {countOf("publie")}, {STATUT_LABEL.en_attente_validation} : {countOf("en_attente_validation")}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/agent/annonces" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
            <Home className="w-4 h-4" /> Voir mes annonces →
          </Link>
        </div>
      </div>

      <Link href="/publier" className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-4 font-semibold text-sm">
        <PlusCircle className="w-5 h-5" /> Publier un nouveau bien
      </Link>
    </div>
  )
}
