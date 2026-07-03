import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { Wrench } from "lucide-react"

export const dynamic = "force-dynamic"

const PILL: Record<string, string> = {
  demande: "bg-gray-100 text-gray-600", devis: "bg-blue-50 text-blue-700",
  en_cours: "bg-amber-50 text-amber-700", termine: "bg-green-50 text-green-700", annule: "bg-red-50 text-red-700",
}

export default async function TravauxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  type Row = { id: string; titre: string; description: string | null; cout: number | null; statut: string; date_demande: string | null; properties: { titre: string } | null }
  let rows: Row[] = []
  try {
    const { data } = await admin.from("travaux")
      .select("id,titre,description,cout,statut,date_demande,properties(titre)")
      .eq("proprietaire_id", user?.id ?? "").order("date_demande", { ascending: false }).limit(200)
    rows = (data ?? []) as Row[]
  } catch { /* table absente → vide */ }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-600" /> Travaux</h2>
      {rows.length === 0 ? (
        <p className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">Aucun travaux enregistré pour le moment.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 truncate">{r.titre}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${PILL[r.statut] ?? "bg-gray-100 text-gray-500"}`}>{r.statut.replace(/_/g, " ")}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {r.properties?.titre ?? "Bien"}{r.cout ? ` · ${formatPrix(r.cout)}` : ""}
              </p>
              {r.description && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{r.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
