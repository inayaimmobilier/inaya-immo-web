import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { Wallet } from "lucide-react"

export const dynamic = "force-dynamic"

const PILL: Record<string, string> = {
  encaisse: "bg-green-50 text-green-700", attendu: "bg-amber-50 text-amber-700", retard: "bg-red-50 text-red-700",
}

export default async function EncaissementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  type Row = { id: string; periode: string | null; montant: number; date_encaissement: string | null; mode: string | null; statut: string; properties: { titre: string } | null }
  let rows: Row[] = []
  try {
    const { data } = await admin.from("encaissements")
      .select("id,periode,montant,date_encaissement,mode,statut,properties(titre)")
      .eq("proprietaire_id", user?.id ?? "").order("date_encaissement", { ascending: false }).limit(200)
    rows = (data ?? []) as Row[]
  } catch { /* table absente → vide */ }

  const total = rows.filter(r => r.statut === "encaisse").reduce((s, r) => s + (Number(r.montant) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Wallet className="w-4 h-4 text-blue-600" /> Encaissements</h2>
        <span className="text-sm text-gray-500">Total encaissé : <strong className="text-gray-900">{formatPrix(total)}</strong></span>
      </div>
      {rows.length === 0 ? (
        <p className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">Aucun encaissement enregistré pour le moment.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.properties?.titre ?? "Bien"}</p>
                <p className="text-xs text-gray-500">{r.periode ?? "—"} · {r.mode ?? "—"}{r.date_encaissement ? ` · ${r.date_encaissement}` : ""}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{formatPrix(r.montant)}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${PILL[r.statut] ?? "bg-gray-100 text-gray-500"}`}>{r.statut}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
