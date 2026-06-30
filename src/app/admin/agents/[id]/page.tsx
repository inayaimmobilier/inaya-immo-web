import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { ArrowLeft, Phone, User, CheckCircle2, Clock, Wallet, MessageSquare } from "lucide-react"
import { formatPrix, formatDate, LEAD_STATUT_LABEL, LEAD_STATUT_COLOR } from "@/lib/utils"
import type { UserRole } from "@/types/database"
import AgentAccount from "./AgentAccount"
import EditAgentModal from "./EditAgentModal"

export const metadata = { title: "Agent · Inaya Immo" }

interface PageProps { params: Promise<{ id: string }> }

const EN_COURS = new Set(["en_traitement", "contacte", "visite_planifiee", "visite_effectuee"])

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/admin/agents/${id}`)
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  const { data: agData } = await admin.from("profiles").select("id, nom, prenom, telephone, status, role, created_at, agent_type, agence").eq("id", id).single()
  const agent = agData as { id: string; nom: string | null; prenom: string | null; telephone: string | null; status: string; role: string; created_at: string; agent_type: string | null; agence: string | null } | null
  if (!agent || agent.role !== "agent") notFound()

  const [{ data: leadData }, { data: txData }] = await Promise.all([
    admin.from("leads").select("id, statut, contact_nom, created_at, properties(titre)").eq("agent_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("transactions").select("statut, commission_part_agent, montant_transaction, created_at").eq("agent_id", id).order("created_at", { ascending: false }).limit(50),
  ])
  const leads = (leadData ?? []) as { id: string; statut: string; contact_nom: string | null; created_at: string; properties: { titre: string } | { titre: string }[] | null }[]
  const txs = (txData ?? []) as { statut: string; commission_part_agent: number | null; montant_transaction: number | null; created_at: string }[]

  const total = leads.length
  const enCours = leads.filter(l => EN_COURS.has(l.statut)).length
  const conclus = leads.filter(l => l.statut === "conclu").length
  const taux = total ? Math.round((conclus / total) * 100) : 0
  const encaisse = txs.filter(t => t.statut === "payee").reduce((s, t) => s + (t.commission_part_agent ?? 0), 0)
  const due = txs.filter(t => t.statut === "en_cours" || t.statut === "commission_due").reduce((s, t) => s + (t.commission_part_agent ?? 0), 0)
  const nom = `${agent.prenom || ""} ${agent.nom || ""}`.trim() || agent.telephone || "Agent"
  const propTitre = (l: typeof leads[number]) => (Array.isArray(l.properties) ? l.properties[0] : l.properties)?.titre ?? "—"

  const stat = (label: string, value: string, Icon: typeof User, color: string) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
      <div><p className="text-lg font-bold text-gray-900 leading-tight">{value}</p><p className="text-xs text-gray-400">{label}</p></div>
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/agents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux agents
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{nom}</h1>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              {agent.telephone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{agent.telephone}</span>}
              <span>Membre depuis {formatDate(agent.created_at)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${agent.status === "actif" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{agent.status}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {agent.telephone && (
              <a href={`https://wa.me/${agent.telephone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl">
                <MessageSquare className="w-4 h-4" /> WhatsApp
              </a>
            )}
            <EditAgentModal agentId={agent.id} initial={{
              nom: agent.nom ?? "", prenom: agent.prenom, telephone: agent.telephone,
              agent_type: agent.agent_type, agence: agent.agence,
            }} />
            <AgentAccount agentId={agent.id} status={agent.status} nom={nom} />
          </div>
        </div>
      </div>

      {/* Rendements */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat("Leads assignés", String(total), User, "bg-blue-50 text-blue-600")}
        {stat("En cours", String(enCours), Clock, "bg-indigo-50 text-indigo-600")}
        {stat("Conclus", `${conclus} (${taux}%)`, CheckCircle2, "bg-green-50 text-green-600")}
        {stat("Commission encaissée", formatPrix(encaisse), Wallet, "bg-teal-50 text-teal-600")}
      </div>
      {due > 0 && <p className="text-xs text-amber-600">Commission en cours / à payer : <strong>{formatPrix(due)} FCFA</strong></p>}

      {/* Leads de l'agent */}
      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-900">Leads / tâches assignés</h2></div>
        {leads.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-6">Aucun lead assigné à cet agent.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {leads.map(l => (
              <Link key={l.id} href={`/admin/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50/60">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{l.contact_nom || "Client"} · <span className="text-gray-500">{propTitre(l)}</span></p>
                  <p className="text-xs text-gray-400">{formatDate(l.created_at)}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${LEAD_STATUT_COLOR[l.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                  {LEAD_STATUT_LABEL[l.statut] ?? l.statut}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Commissions */}
      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-900">Commissions</h2></div>
        {txs.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-6">Aucune transaction pour cet agent.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {txs.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                <div><p className="text-sm text-gray-900">Transaction · {formatPrix(t.montant_transaction ?? 0)} FCFA</p><p className="text-xs text-gray-400">{formatDate(t.created_at)}</p></div>
                <div className="text-right">
                  <p className="text-sm font-medium text-teal-700">{formatPrix(t.commission_part_agent ?? 0)} FCFA</p>
                  <p className={`text-[11px] ${t.statut === "payee" ? "text-green-600" : "text-amber-600"}`}>{t.statut}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
