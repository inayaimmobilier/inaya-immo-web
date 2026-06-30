import { notFound, redirect } from "next/navigation"
import { ArrowLeft, History } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import CommissionForm from "../CommissionForm"
import { updateRuleAndRedirect } from "../actions"
import { COMMISSION_MODE_LABEL, type CommissionRule } from "@/lib/commissions"
import { formatDate } from "@/lib/utils"
import type { UserRole } from "@/types/database"

export const metadata = { title: "Modifier une règle · Inaya Immo" }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

interface HistoryRow {
  id: string
  snapshot: Record<string, unknown>
  modifie_le: string
}

export default async function EditReglePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { error } = await searchParams

  // Garde d'accès
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/admin/commissions/${id}`)
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const db = createAdminClient()
  const { data: ruleData } = await db.from("commission_rules").select("*").eq("id", id).single()
  const rule = ruleData as CommissionRule | null
  if (!rule) notFound()

  const { data: histData } = await db
    .from("commission_rules_history")
    .select("id, snapshot, modifie_le")
    .eq("rule_id", id)
    .order("modifie_le", { ascending: false })
    .limit(20)
  const history = (histData ?? []) as HistoryRow[]

  const updateAction = updateRuleAndRedirect.bind(null, id)

  return (
    <div className="p-6 space-y-6">
      <div>
        <a href="/admin/commissions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux règles
        </a>
        <h1 className="text-2xl font-bold text-gray-900">Modifier : {rule.nom}</h1>
      </div>

      <CommissionForm action={updateAction} initial={rule} error={error} submitLabel="Enregistrer les modifications" />

      {/* Historique immuable */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 max-w-3xl">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-500" /> Historique des modifications
          <span className="text-xs font-normal text-gray-400">({history.length})</span>
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune modification enregistrée pour l&apos;instant.</p>
        ) : (
          <ol className="space-y-3">
            {history.map(h => {
              const s = h.snapshot as Partial<CommissionRule>
              return (
                <li key={h.id} className="border-l-2 border-gray-100 pl-4 py-1">
                  <p className="text-xs text-gray-400">{formatDate(h.modifie_le)}</p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{s.nom}</span> ·{" "}
                    {s.mode_calcul ? COMMISSION_MODE_LABEL[s.mode_calcul] : "—"} ·{" "}
                    valeur {String(s.valeur ?? "—")} · split agent {String(s.split_agent_pct ?? "—")} %
                    {s.actif === false && <span className="text-gray-400"> · inactive</span>}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
        <p className="text-[11px] text-gray-400 mt-4">
          Chaque ligne est l&apos;état de la règle <em>avant</em> une modification. L&apos;historique est en lecture seule.
        </p>
      </section>
    </div>
  )
}
