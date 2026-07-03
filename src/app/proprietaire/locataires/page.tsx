import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { Users } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function LocatairesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  type Row = { id: string; nom: string | null; telephone: string | null; loyer_mensuel: number | null; date_entree: string | null; statut: string; properties: { titre: string } | null }
  let rows: Row[] = []
  try {
    const { data } = await admin.from("locataires")
      .select("id,nom,telephone,loyer_mensuel,date_entree,statut,properties(titre)")
      .eq("proprietaire_id", user?.id ?? "").order("created_at", { ascending: false }).limit(200)
    rows = (data ?? []) as Row[]
  } catch { /* table absente → vide */ }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" /> Locataires</h2>
      {rows.length === 0 ? (
        <p className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">Aucun locataire enregistré pour le moment.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.nom ?? "Locataire"}</p>
                <p className="text-xs text-gray-500">{r.properties?.titre ?? "Bien"}{r.date_entree ? ` · depuis ${r.date_entree}` : ""}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{r.loyer_mensuel ? `${formatPrix(r.loyer_mensuel)}/mois` : "—"}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.statut === "actif" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{r.statut}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
