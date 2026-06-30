import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { TrendingUp, Plus, Star, CheckCircle2, AlertTriangle } from "lucide-react"
import {
  COMMISSION_MODE_LABEL, ruleCriteresSummary, type CommissionRule,
} from "@/lib/commissions"
import type { UserRole } from "@/types/database"
import Simulator from "./Simulator"
import RuleActions from "./RuleActions"

export const metadata = { title: "Commissions · Inaya Immo" }

interface PageProps {
  searchParams: Promise<{ ok?: string; error?: string }>
}

function modeValueLabel(r: CommissionRule): string {
  if (r.mode_calcul === "fixe") return `${r.valeur.toLocaleString("fr-FR")} XOF`
  if (r.mode_calcul === "nb_mois") return `${r.valeur} mois`
  return `${r.valeur} %`
}

export default async function CommissionsPage({ searchParams }: PageProps) {
  const params = await searchParams

  // Garde d'accès : admin / super_admin uniquement
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/commissions")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const db = createAdminClient()
  const { data: rulesData } = await db
    .from("commission_rules")
    .select("*")
    .order("priorite", { ascending: false })
    .order("created_at", { ascending: false })

  const rules = (rulesData ?? []) as CommissionRule[]
  const activeRules = rules.filter(r => r.actif)
  const hasDefault = rules.some(r => r.est_defaut && r.actif)

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" /> Règles de commission
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {rules.length} règle{rules.length > 1 ? "s" : ""} · modifiables à tout moment · historique conservé
          </p>
        </div>
        <a href="/admin/commissions/nouvelle"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Nouvelle règle
        </a>
      </div>

      {/* Messages */}
      {params.ok && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" />
          {params.ok === "created" ? "Règle créée." : "Règle mise à jour. L'ancienne version est archivée dans l'historique."}
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{params.error}</div>
      )}
      {!hasDefault && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Aucune règle par défaut active : certaines opérations pourraient ne correspondre à aucune règle. Définissez-en une.
        </div>
      )}

      {/* Simulateur */}
      <Simulator rules={activeRules} />

      {/* Liste des règles */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {rules.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">Aucune règle de commission définie.</p>
            <a href="/admin/commissions/nouvelle" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Créer la première règle →
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                  <th className="px-4 py-3 w-12">Prio.</th>
                  <th className="px-4 py-3">Règle</th>
                  <th className="px-4 py-3">Critères</th>
                  <th className="px-4 py-3">Calcul</th>
                  <th className="px-4 py-3">Split</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className={`border-t border-gray-50 hover:bg-gray-50/60 transition-colors ${!r.actif ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{r.priorite}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900">{r.nom}</span>
                        {r.est_defaut && (
                          <span title="Règle par défaut" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> défaut
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={ruleCriteresSummary(r)}>
                      {ruleCriteresSummary(r)}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="font-semibold text-gray-900">{modeValueLabel(r)}</span>
                      <span className="block text-[11px] text-gray-400">{COMMISSION_MODE_LABEL[r.mode_calcul]}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      Agent {r.split_agent_pct}%
                    </td>
                    <td className="px-4 py-3">
                      <RuleActions id={r.id} actif={r.actif} estDefaut={r.est_defaut} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        La règle appliquée à une opération est celle de plus haute priorité dont tous les critères correspondent.
        Si aucune ne correspond, la règle <strong>par défaut</strong> sert de filet de sécurité.
        Chaque modification archive automatiquement l&apos;ancienne version (traçabilité comptable).
      </p>
    </div>
  )
}
