import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  ArrowLeft, User, Phone, Mail, Home, Calendar, MessageSquare, CheckCircle2, XCircle, Clock, RefreshCw,
} from "lucide-react"
import { formatDateTime, LEAD_STATUT_LABEL, LEAD_STATUT_COLOR } from "@/lib/utils"
import type { UserRole } from "@/types/database"
import LeadStatusManager from "./LeadStatusManager"
import AssignAgent from "./AssignAgent"
import TestFlowPanel from "./TestFlowPanel"
import { forceAgentConfirmation } from "./actions"

export const metadata = { title: "Détail du lead · Inaya Immo" }

interface PageProps { params: Promise<{ id: string }> }

interface LeadRow {
  id: string; statut: string; canal: string
  contact_nom: string | null; contact_telephone: string | null; contact_email: string | null
  message: string | null; creneaux: { souhaite?: string }[] | null; compte_rendu: string | null
  validation_proprietaire: string | null; validated_proprio_le: string | null
  pris_en_charge_le: string | null; rdv_paiement_le: string | null
  agent_id: string | null; agent_confirmation_le: string | null; created_at: string
  properties: { id: string; titre: string; quartier: string | null; ville: string | null } | null
}

const VALIDATION_BADGE: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente du propriétaire", cls: "bg-amber-50 text-amber-700 border-amber-100" },
  confirme:   { label: "Confirmé par le propriétaire", cls: "bg-green-50 text-green-700 border-green-100" },
  refuse:     { label: "Refusé par le propriétaire", cls: "bg-red-50 text-red-700 border-red-100" },
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/admin/leads/${id}`)
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin", "moderateur", "agent"].includes(role)) redirect("/admin/dashboard")

  // 42703 = colonne agent_confirmation_le absente (migration 028 non encore appliquée)
  type SupaRow = { data: Record<string, unknown> | null; error: { code: string; message: string } | null }
  const r1 = await supabase
    .from("leads")
    .select("id,statut,canal,contact_nom,contact_telephone,contact_email,message,creneaux,compte_rendu,validation_proprietaire,validated_proprio_le,pris_en_charge_le,rdv_paiement_le,agent_id,agent_confirmation_le,created_at,properties(id,titre,quartier,ville)")
    .eq("id", id)
    .single() as unknown as SupaRow
  let leadRaw: Record<string, unknown> | null = r1.data
  if (r1.error?.code === "42703") {
    const r2 = await supabase
      .from("leads")
      .select("id,statut,canal,contact_nom,contact_telephone,contact_email,message,creneaux,compte_rendu,validation_proprietaire,validated_proprio_le,pris_en_charge_le,rdv_paiement_le,agent_id,created_at,properties(id,titre,quartier,ville)")
      .eq("id", id)
      .single() as unknown as SupaRow
    leadRaw = r2.data ? { ...r2.data, agent_confirmation_le: null } : null
  }
  const lead = leadRaw as LeadRow | null
  if (!lead) notFound()

  // Historique des relances WhatsApp pour ce lead
  const admin = createAdminClient()
  let { data: followupsData } = await admin
    .from("lead_followups")
    .select("id,ref,statut_avant,statut_apres,reponse_brute,montant_transaction,awaiting_montant,envoye_le,repondu_le")
    .eq("lead_id", id)
    .order("envoye_le", { ascending: false })
    .limit(20)
  if (!followupsData) {
    // Fallback si colonnes manquantes (awaiting_montant, etc.)
    const fb = await admin
      .from("lead_followups")
      .select("id,ref,statut_avant,statut_apres,reponse_brute,envoye_le,repondu_le")
      .eq("lead_id", id)
      .order("envoye_le", { ascending: false })
      .limit(20)
    followupsData = (fb.data ?? []).map((r: Record<string, unknown>) => ({ ...r, montant_transaction: null, awaiting_montant: false })) as never
  }
  type FollowupRow = {
    id: string; ref: string; statut_avant: string; statut_apres: string | null
    reponse_brute: string | null; montant_transaction: number | null; awaiting_montant: boolean
    envoye_le: string; repondu_le: string | null
  }
  const followups = ((followupsData ?? []) as FollowupRow[]).filter(f => !f.awaiting_montant || f.repondu_le)

  // Agents actifs pour l'assignation
  const { data: agData } = await admin
    .from("profiles").select("id, nom, prenom, telephone").eq("role", "agent").eq("status", "actif").order("nom")
  const agents = ((agData ?? []) as { id: string; nom: string | null; prenom: string | null; telephone: string | null }[])
    .map(a => ({ id: a.id, nom: `${a.prenom || ""} ${a.nom || ""}`.trim() || a.telephone || "Agent" }))

  const prop = lead.properties
  const creneau = lead.creneaux?.[0]?.souhaite ?? null
  const validation = lead.validation_proprietaire ? VALIDATION_BADGE[lead.validation_proprietaire] : null
  const telDigits = lead.contact_telephone?.replace(/\D/g, "") ?? ""

  const Row = ({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 px-5 py-3">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
        <div className="text-sm text-gray-800">{children}</div>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/leads" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux leads
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Demande de visite</h1>
            <p className="text-sm text-gray-500 mt-1">Reçue le {formatDateTime(lead.created_at)} · via {lead.canal}</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${LEAD_STATUT_COLOR[lead.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
            {LEAD_STATUT_LABEL[lead.statut] ?? lead.statut}
          </span>
        </div>
      </div>

      {/* Validation propriétaire */}
      {validation && (
        <div className={`flex items-center gap-2 text-sm font-medium px-4 py-3 rounded-2xl border ${validation.cls}`}>
          {lead.validation_proprietaire === "confirme" ? <CheckCircle2 className="w-4 h-4" />
            : lead.validation_proprietaire === "refuse" ? <XCircle className="w-4 h-4" />
            : <Clock className="w-4 h-4" />}
          Rendez-vous : {validation.label}
          {lead.validated_proprio_le && (
            <span className="text-xs font-normal opacity-80">· {formatDateTime(lead.validated_proprio_le)}</span>
          )}
        </div>
      )}

      {/* Coordonnées + demande */}
      <section className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Client &amp; demande</h2>
        </div>
        <Row icon={User} label="Client">{lead.contact_nom || "—"}</Row>
        <Row icon={Phone} label="Téléphone">
          {lead.contact_telephone ? (
            <span className="flex items-center gap-3">
              <a href={`tel:${lead.contact_telephone}`} className="text-blue-600 hover:underline">{lead.contact_telephone}</a>
              {telDigits && (
                <a href={`https://wa.me/${telDigits}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full hover:bg-green-100">WhatsApp</a>
              )}
            </span>
          ) : "—"}
        </Row>
        <Row icon={Mail} label="E-mail">
          {lead.contact_email ? <a href={`mailto:${lead.contact_email}`} className="text-blue-600 hover:underline">{lead.contact_email}</a> : "—"}
        </Row>
        <Row icon={Home} label="Annonce">
          {prop ? (
            <Link href={`/admin/annonces/${prop.id}`} className="text-blue-600 hover:underline">
              {prop.titre}{prop.quartier ? ` · ${prop.quartier}` : ""}{prop.ville ? ` · ${prop.ville}` : ""}
            </Link>
          ) : "—"}
        </Row>
        {creneau && <Row icon={Calendar} label="Créneau souhaité">{creneau}</Row>}
        {lead.message && <Row icon={MessageSquare} label="Message du client">{lead.message}</Row>}
        {lead.rdv_paiement_le && (
          <Row icon={Calendar} label="RDV paiement">
            <span className="font-medium text-violet-700">{formatDateTime(lead.rdv_paiement_le)}</span>
          </Row>
        )}
        {lead.pris_en_charge_le && (
          <Row icon={Clock} label="Prise en charge">{formatDateTime(lead.pris_en_charge_le)}</Row>
        )}
      </section>

      {/* Gestion du statut */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Suivi du lead</h2>
        <AssignAgent leadId={lead.id} agents={agents} current={lead.agent_id} />

        {/* Badge de confirmation de prise en charge */}
        {lead.agent_id && (
          lead.agent_confirmation_le ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Prise en charge confirmée par l&apos;agent le <strong>{formatDateTime(lead.agent_confirmation_le)}</strong></span>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>En attente de confirmation de l&apos;agent (réponse WA attendue)</span>
              </div>
              {["super_admin", "admin"].includes(role) && (
                <form action={forceAgentConfirmation.bind(null, lead.id)}>
                  <button
                    type="submit"
                    className="shrink-0 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
                  >
                    Forcer ✓
                  </button>
                </form>
              )}
            </div>
          )
        )}

        <div className="border-t border-gray-50 pt-4">
          <LeadStatusManager leadId={lead.id} currentStatut={lead.statut} initialNote={lead.compte_rendu} />
        </div>
      </section>

      {/* Test du processus complet */}
      {lead.agent_id && !["conclu", "abandonne"].includes(lead.statut) && (
        <section className="bg-violet-50 border border-violet-100 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Simulation du processus</h2>
          <p className="text-xs text-gray-500 mb-3">
            Testez le flux WhatsApp complet : relance → réponse agent → avancement lead → transaction & commissions.
          </p>
          <TestFlowPanel leadId={lead.id} />
        </section>
      )}

      {/* Historique des relances WhatsApp */}
      {followups.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Relances WhatsApp ({followups.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {followups.map(f => (
              <div key={f.id} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">[{f.ref}]</span>
                    <span className="text-xs text-gray-500">{formatDateTime(f.envoye_le)}</span>
                    {!f.repondu_le && (
                      <span className="text-[11px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">En attente</span>
                    )}
                  </div>
                  {f.reponse_brute && (
                    <p className="text-xs text-gray-700">
                      Réponse : <span className="font-medium">{f.reponse_brute}</span>
                      {f.statut_apres && (
                        <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${LEAD_STATUT_COLOR[f.statut_apres] ?? "bg-gray-100 text-gray-500"}`}>
                          → {LEAD_STATUT_LABEL[f.statut_apres] ?? f.statut_apres}
                        </span>
                      )}
                    </p>
                  )}
                  {f.montant_transaction != null && (
                    <p className="text-xs text-green-700 font-medium">
                      Transaction : {f.montant_transaction.toLocaleString("fr-FR")} FCFA
                    </p>
                  )}
                </div>
                {f.repondu_le && (
                  <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{formatDateTime(f.repondu_le)}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
