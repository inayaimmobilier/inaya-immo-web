import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { Banknote } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function VersementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  type Row = { id: string; periode: string | null; montant_brut: number; commission: number; frais_travaux: number; montant_net: number; date_versement: string | null; statut: string }
  let rows: Row[] = []
  try {
    const { data } = await admin.from("versements")
      .select("id,periode,montant_brut,commission,frais_travaux,montant_net,date_versement,statut")
      .eq("proprietaire_id", user?.id ?? "").order("created_at", { ascending: false }).limit(200)
    rows = (data ?? []) as Row[]
  } catch { /* table absente → vide */ }

  const totalVerse = rows.filter(r => r.statut === "verse").reduce((s, r) => s + (Number(r.montant_net) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Banknote className="w-4 h-4 text-blue-600" /> Versements</h2>
        <span className="text-sm text-gray-500">Total versé : <strong className="text-gray-900">{formatPrix(totalVerse)}</strong></span>
      </div>
      {rows.length === 0 ? (
        <p className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">Aucun versement pour le moment.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900">{r.periode ?? "Période —"}</p>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatPrix(r.montant_net)}</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.statut === "verse" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{r.statut}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Brut {formatPrix(r.montant_brut)} − commission {formatPrix(r.commission)} − travaux {formatPrix(r.frais_travaux)}
                {r.date_versement ? ` · ${r.date_versement}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
