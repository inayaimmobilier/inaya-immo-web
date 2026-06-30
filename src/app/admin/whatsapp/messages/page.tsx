import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { ArrowLeft, CheckCircle2, Clock, XCircle, MessageSquare, AlertTriangle, RefreshCw } from "lucide-react"
import type { UserRole } from "@/types/database"
import { formatDate } from "@/lib/utils"
import TestPipeline from "./TestPipeline"

export const metadata = { title: "Messages WhatsApp · Inaya Admin" }

interface MsgRow {
  id: string
  group_id: string | null
  sender: string | null
  sender_name: string | null
  contenu: string | null
  traite: boolean
  en_traitement: boolean | null
  tentatives: number | null
  erreur_traitement: string | null
  type: string | null
  property_id: string | null
  search_request_id: string | null
  ia_extraction: unknown
  recu_le: string
}

const TYPE_BADGE: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  offre:      { label: "Offre",       cls: "bg-blue-50 text-blue-700",   Icon: CheckCircle2 },
  demande:    { label: "Demande",     cls: "bg-amber-50 text-amber-700", Icon: MessageSquare },
  hors_sujet: { label: "Hors sujet", cls: "bg-gray-100 text-gray-500",  Icon: XCircle },
}

export default async function WhatsAppMessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/whatsapp/messages")

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()

  // Compte WhatsApp actif pour le panneau de test
  let firstAccountId: string | null = null
  try {
    const { data: accts } = await admin
      .from("whatsapp_accounts")
      .select("id")
      .eq("actif", true)
      .limit(1)
    firstAccountId = ((accts ?? []) as { id: string }[])[0]?.id ?? null
  } catch { /* ignore */ }

  // Derniers 50 messages WhatsApp
  let messages: MsgRow[] = []
  try {
    const { data } = await admin
      .from("whatsapp_messages")
      .select("id,group_id,sender,sender_name,contenu,traite,en_traitement,tentatives,erreur_traitement,type,property_id,search_request_id,ia_extraction,recu_le")
      .order("recu_le", { ascending: false })
      .limit(50)
    messages = (data ?? []) as MsgRow[]
  } catch { /* table absente */ }

  const nonTraites = messages.filter(m => !m.traite).length
  const enTraitement = messages.filter(m => m.en_traitement).length
  const offres = messages.filter(m => m.type === "offre").length
  const horssujet = messages.filter(m => m.type === "hors_sujet").length
  const enErreur = messages.filter(m => !m.traite && (m.tentatives ?? 0) >= 3).length

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <Link href="/admin/whatsapp" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour WhatsApp
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Messages WhatsApp reçus</h1>
        <p className="text-sm text-gray-500 mt-1">
          Audit du pipeline d&apos;ingestion — 50 derniers messages
        </p>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total reçus",    value: messages.length, cls: "text-gray-900" },
          { label: "Offres créées",  value: offres,          cls: "text-blue-700" },
          { label: "En file",        value: nonTraites,      cls: nonTraites > 0 ? "text-amber-600" : "text-gray-400" },
          { label: "En traitement",  value: enTraitement,    cls: enTraitement > 0 ? "text-blue-500" : "text-gray-400" },
          { label: "En erreur",      value: enErreur,        cls: enErreur > 0 ? "text-red-600" : "text-gray-400" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Panneau de test pipeline */}
      <TestPipeline accountId={firstAccountId} />

      {/* Bouton actualiser */}
      <div className="flex justify-end">
        <Link href="/admin/whatsapp/messages"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Actualiser
        </Link>
      </div>

      {/* Alerte si messages non traités */}
      {nonTraites > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {nonTraites} message{nonTraites > 1 ? "s" : ""} non traité{nonTraites > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Causes fréquentes : migration SQL manquante (010 ou 007), erreur de classification IA, colonne absente en DB.
              Vérifiez les logs du service WhatsApp.
            </p>
          </div>
        </div>
      )}

      {/* Table messages */}
      {messages.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            Aucun message reçu. La table <code className="bg-gray-100 px-1 rounded text-xs">whatsapp_messages</code> est vide ou absente.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {messages.map(m => {
              const badge = m.type ? (TYPE_BADGE[m.type] ?? { label: m.type, cls: "bg-gray-100 text-gray-500", Icon: Clock }) : null
              const BadgeIcon = badge?.Icon ?? Clock
              return (
                <div key={m.id} className="px-5 py-4 flex items-start gap-3">
                  {/* Statut traitement */}
                  <div className="mt-0.5 shrink-0">
                    {m.traite
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : <Clock className="w-4 h-4 text-amber-400" />}
                  </div>

                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {badge && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                          <BadgeIcon className="w-3 h-3" /> {badge.label}
                        </span>
                      )}
                      {m.property_id && (
                        <Link href={`/admin/annonces/${m.property_id}`}
                          className="text-[11px] text-blue-600 hover:underline font-medium">
                          → voir l&apos;annonce
                        </Link>
                      )}
                      {!m.traite && m.en_traitement && (
                        <span className="text-[11px] text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
                          En traitement…
                        </span>
                      )}
                      {!m.traite && !m.en_traitement && (m.tentatives ?? 0) < 3 && (
                        <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                          En file ({m.tentatives ?? 0}/3 tentatives)
                        </span>
                      )}
                      {!m.traite && (m.tentatives ?? 0) >= 3 && (
                        <span className="text-[11px] text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
                          Échec définitif
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">{formatDate(m.recu_le)}</span>
                    </div>

                    <p className="text-xs text-gray-700 line-clamp-2 font-mono bg-gray-50 rounded-lg px-2 py-1.5 mt-1">
                      {m.contenu ?? "—"}
                    </p>

                    {m.sender && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        {m.sender_name && <><strong>{m.sender_name}</strong> · </>}
                        {m.sender.replace("@s.whatsapp.net", "")}
                        {m.group_id && ` · Groupe : ${m.group_id.replace("@g.us", "")}`}
                      </p>
                    )}

                    {m.erreur_traitement && (
                      <p className="text-[11px] text-red-500 mt-1 font-mono bg-red-50 rounded px-1.5 py-0.5">
                        ⚠ {m.erreur_traitement}
                      </p>
                    )}

                    {/* Extraction IA si disponible */}
                    {!!m.ia_extraction && m.type === "offre" && (
                      <details className="mt-1.5">
                        <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600">
                          Données extraites par l&apos;IA ▸
                        </summary>
                        <pre className="text-[10px] text-gray-500 bg-gray-50 rounded-lg p-2 mt-1 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(m.ia_extraction, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Guide migrations */}
      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Migrations SQL requises</h2>
        <div className="space-y-2 text-xs font-mono text-slate-600">
          {[
            { n: "007", desc: "Colonnes QR + ia_moderation_* sur properties et whatsapp_accounts" },
            { n: "008", desc: "Table whatsapp_groups (synchro des groupes)" },
            { n: "009", desc: "Tables villes et quartiers" },
            { n: "010", desc: "Colonnes mois_caution / mois_avance / mois_agence sur properties" },
            { n: "011", desc: "Table service_banners (espaces publicitaires)" },
            { n: "012", desc: "Colonne nb_pieces_min sur search_requests" },
            { n: "013", desc: "Colonnes file d'attente sur whatsapp_messages (sender_name, en_traitement, tentatives, erreur_traitement)" },
          ].map(m => (
            <div key={m.n} className="flex items-start gap-2">
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 shrink-0">
                {m.n}
              </code>
              <span className="text-slate-500">{m.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Exécutez ces migrations dans l&apos;ordre dans l&apos;éditeur SQL de Supabase. Les fichiers sont dans{" "}
          <code className="bg-white border border-slate-200 px-1 rounded">supabase/migrations/</code>.
        </p>
      </div>
    </div>
  )
}
