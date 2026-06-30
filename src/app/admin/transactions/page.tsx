import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Wallet, Plus, CheckCircle2, Clock, Banknote } from "lucide-react"
import { formatPrix, formatRelativeDate } from "@/lib/utils"
import type { UserRole, TransactionStatus, PropertyType, PaymentMode } from "@/types/database"
import StatusControl from "./StatusControl"

export const metadata = { title: "Transactions · Inaya Immo" }

interface PageProps {
  searchParams: Promise<{ statut?: string; ok?: string }>
}

interface TxRow {
  id: string; type_operation: PropertyType; montant_transaction: number
  commission_montant_total: number; commission_part_inaya: number; commission_part_agent: number
  statut: TransactionStatus; mode_paiement: PaymentMode | null; paye_le: string | null; created_at: string
  properties: { titre: string; quartier: string | null } | null
}

const STATUTS = [
  { value: "", label: "Toutes" },
  { value: "en_cours", label: "En cours" },
  { value: "commission_due", label: "Commission due" },
  { value: "payee", label: "Payées" },
  { value: "annulee", label: "Annulées" },
]

const MODE_LABEL: Record<string, string> = {
  liquide: "Liquide",
  mobile_money_direct: "Mobile Money",
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/transactions")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  let query = supabase
    .from("transactions")
    .select("id,type_operation,montant_transaction,commission_montant_total,commission_part_inaya,commission_part_agent,statut,mode_paiement,paye_le,created_at,properties(titre,quartier)")
    .order("created_at", { ascending: false })
    .limit(100)
  if (params.statut) query = query.eq("statut", params.statut as never)

  const { data } = await query
  const txs = (data ?? []) as unknown as TxRow[]

  // KPIs
  const inayaPaye = txs.filter(t => t.statut === "payee").reduce((s, t) => s + t.commission_part_inaya, 0)
  const inayaDue = txs.filter(t => t.statut === "commission_due" || t.statut === "en_cours")
    .reduce((s, t) => s + t.commission_part_inaya, 0)
  const volume = txs.filter(t => t.statut !== "annulee").reduce((s, t) => s + t.montant_transaction, 0)

  const kpis = [
    { icon: Banknote, label: "Volume transactions", value: formatPrix(volume), cls: "bg-blue-50 text-blue-600" },
    { icon: CheckCircle2, label: "Commission Inaya encaissée", value: formatPrix(inayaPaye), cls: "bg-green-50 text-green-600" },
    { icon: Clock, label: "Commission Inaya à venir", value: formatPrix(inayaDue), cls: "bg-amber-50 text-amber-600" },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" /> Transactions
          </h1>
          <p className="text-sm text-gray-500 mt-1">Suivi des opérations et des commissions</p>
        </div>
        <a href="/admin/transactions/nouvelle"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Nouvelle transaction
        </a>
      </div>

      {params.ok && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" /> Transaction enregistrée, commission calculée automatiquement.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {kpis.map(({ icon: Icon, label, value, cls }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${cls}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {STATUTS.map(s => {
          const active = (params.statut || "") === s.value
          const href = s.value ? `/admin/transactions?statut=${s.value}` : "/admin/transactions"
          return (
            <a key={s.value || "all"} href={href}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
              }`}>
              {s.label}
            </a>
          )
        })}
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {txs.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">Aucune transaction.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                  <th className="px-4 py-3">Bien</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Inaya / Agent</th>
                  <th className="px-4 py-3">Paiement</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {txs.map(t => (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{t.properties?.titre ?? "—"}</p>
                      <p className="text-xs text-gray-400">{t.type_operation === "location" ? "Location" : "Vente"} · {t.properties?.quartier ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{formatPrix(t.montant_transaction)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-blue-700 whitespace-nowrap">{formatPrix(t.commission_montant_total)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatPrix(t.commission_part_inaya)} / {formatPrix(t.commission_part_agent)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.mode_paiement ? MODE_LABEL[t.mode_paiement] : "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatRelativeDate(t.created_at)}</td>
                    <td className="px-4 py-3"><StatusControl id={t.id} statut={t.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Paiements MVP : liquide ou Mobile Money direct uniquement (pas de paiement en ligne).
        La commission est figée à la création selon la règle applicable au moment de l&apos;opération.
      </p>
    </div>
  )
}
