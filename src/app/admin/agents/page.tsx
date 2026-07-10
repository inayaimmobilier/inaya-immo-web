import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Users, Trophy, TrendingUp, Wallet, CheckCircle2, Clock } from "lucide-react"
import { formatPrix } from "@/lib/utils"
import type { UserRole } from "@/types/database"
import AddAgentModal from "./AddAgentModal"
import AgentApplications, { type PendingApplication } from "./AgentApplications"

export const metadata = { title: "Agents · Inaya Immo" }

interface Agent { id: string; nom: string | null; prenom: string | null; telephone: string | null; status: string; agent_type?: string | null; agence?: string | null }
interface LeadRow { agent_id: string | null; statut: string }
interface TxRow { agent_id: string | null; statut: string; commission_part_agent: number | null }

const EN_COURS = new Set(["en_traitement", "contacte", "visite_planifiee", "visite_effectuee"])
const MEDAL = ["🥇", "🥈", "🥉"]

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/agents")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  const [{ data: agData }, { data: leadData }, { data: txData }, appsRes] = await Promise.all([
    admin.from("profiles").select("*").eq("role", "agent").order("created_at"),
    admin.from("leads").select("agent_id, statut").not("agent_id", "is", null),
    admin.from("transactions").select("agent_id, statut, commission_part_agent").not("agent_id", "is", null),
    admin.from("agent_applications")
      .select("id, agence, message, created_at, profiles(nom, prenom, telephone)")
      .eq("statut", "en_attente").order("created_at", { ascending: true }),
  ])

  const agents = (agData ?? []) as Agent[]
  const leads = (leadData ?? []) as LeadRow[]
  const txs = (txData ?? []) as TxRow[]

  type AppRow = {
    id: string; agence: string | null; message: string | null; created_at: string
    profiles: { nom: string | null; prenom: string | null; telephone: string | null } | { nom: string | null; prenom: string | null; telephone: string | null }[] | null
  }
  const applications: PendingApplication[] = ((appsRes.data ?? []) as AppRow[]).map(r => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      id: r.id, agence: r.agence, message: r.message, created_at: r.created_at,
      nom: `${p?.prenom || ""} ${p?.nom || ""}`.trim() || "Candidat",
      telephone: p?.telephone ?? null,
    }
  })

  const stats = agents.map(a => {
    const aLeads = leads.filter(l => l.agent_id === a.id)
    const aTx = txs.filter(t => t.agent_id === a.id)
    const total = aLeads.length
    const enCours = aLeads.filter(l => EN_COURS.has(l.statut)).length
    const conclus = aLeads.filter(l => l.statut === "conclu").length
    const taux = total ? Math.round((conclus / total) * 100) : 0
    const encaisse = aTx.filter(t => t.statut === "payee").reduce((s, t) => s + (t.commission_part_agent ?? 0), 0)
    const dueAmt = aTx.filter(t => t.statut === "en_cours" || t.statut === "commission_due").reduce((s, t) => s + (t.commission_part_agent ?? 0), 0)
    return { agent: a, total, enCours, conclus, taux, encaisse, dueAmt }
  }).sort((x, y) => y.encaisse - x.encaisse || y.conclus - x.conclus)

  const nom = (a: Agent) => `${a.prenom || ""} ${a.nom || ""}`.trim() || a.telephone || "Agent"
  const totalEncaisse = stats.reduce((s, x) => s + x.encaisse, 0)
  const totalConclus = stats.reduce((s, x) => s + x.conclus, 0)

  const card = (label: string, value: string, Icon: typeof Users, color: string) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
      <div><p className="text-lg font-bold text-gray-900 leading-tight">{value}</p><p className="text-xs text-gray-400">{label}</p></div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6 text-blue-600" /> Agents immobiliers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Comptes, commissions, classement et rendements de l&apos;équipe.</p>
        </div>
        <AddAgentModal />
      </div>

      <AgentApplications applications={applications} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {card("Agents actifs", String(agents.filter(a => a.status === "actif").length), Users, "bg-blue-50 text-blue-600")}
        {card("Affaires conclues", String(totalConclus), CheckCircle2, "bg-green-50 text-green-600")}
        {card("Commissions agents encaissées", formatPrix(totalEncaisse), Wallet, "bg-teal-50 text-teal-600")}
        {card("Top agent", stats[0] ? nom(stats[0].agent) : "—", Trophy, "bg-amber-50 text-amber-600")}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              <th className="px-4 py-3 font-medium">En cours</th>
              <th className="px-4 py-3 font-medium">Conclus</th>
              <th className="px-4 py-3 font-medium">Conversion</th>
              <th className="px-4 py-3 font-medium">Commission due</th>
              <th className="px-4 py-3 font-medium">Encaissé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stats.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Aucun agent. Créez des comptes « agent » dans Utilisateurs.</td></tr>
            ) : stats.map((s, i) => (
              <tr key={s.agent.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 text-base">{MEDAL[i] ?? <span className="text-gray-400 text-sm">{i + 1}</span>}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/agents/${s.agent.id}`} className="font-medium text-blue-700 hover:underline">{nom(s.agent)}</Link>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${s.agent.agent_type === "externe" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`}>
                      {s.agent.agent_type === "externe" ? "Externe" : "Interne"}
                    </span>
                    {s.agent.status !== "actif" && <span className="text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">{s.agent.status}</span>}
                  </span>
                  {s.agent.agence && <p className="text-xs text-gray-400">{s.agent.agence}</p>}
                  {s.agent.telephone && <p className="text-xs text-gray-400">{s.agent.telephone}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700">{s.total}</td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-indigo-600"><Clock className="w-3.5 h-3.5" />{s.enCours}</span></td>
                <td className="px-4 py-3 text-green-700 font-medium">{s.conclus}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-blue-500" style={{ width: `${s.taux}%` }} /></span>
                    <span className="text-xs text-gray-500">{s.taux}%</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-amber-700 whitespace-nowrap">{s.dueAmt ? `${formatPrix(s.dueAmt)} F` : "—"}</td>
                <td className="px-4 py-3 text-teal-700 font-medium whitespace-nowrap">{s.encaisse ? `${formatPrix(s.encaisse)} F` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5" /> Classement par commission encaissée. Cliquez sur un agent pour gérer son compte et voir le détail.
      </p>
    </div>
  )
}
