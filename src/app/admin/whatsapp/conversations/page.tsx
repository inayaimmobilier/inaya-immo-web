import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { ArrowLeft, MessageSquare, PauseCircle, Bot, User } from "lucide-react"
import type { UserRole } from "@/types/database"
import { formatDate } from "@/lib/utils"
import { BasculePause, PauseManuelle } from "./PauseControls"

export const metadata = { title: "Conversations WhatsApp · Inaya Admin" }
export const dynamic = "force-dynamic"

interface LogRow {
  telephone: string
  affiche: string | null
  sens: "client" | "assistante" | "admin"
  texte: string
  motif_silence: string | null
  cree_le: string
}

interface Conversation {
  telephone: string
  affiche: string
  dernier: LogRow
  messages: number
  enPause: boolean
}

const MOTIF_LISIBLE: Record<string, string> = {
  pause_globale: "assistante en pause pour tout le monde",
  aucun_agent_actif: "aucun agent IA WhatsApp actif",
  pause_conversation: "conversation reprise en main",
}

export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/whatsapp/conversations")

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()

  // Le journal est plat : on regroupe par numéro ici plutôt que d'ajouter une
  // fonction SQL. 400 lignes couvrent largement les conversations récentes.
  let logs: LogRow[] = []
  let tableManquante = false
  try {
    const { data, error } = await admin.from("wa_dm_log")
      .select("telephone,affiche,sens,texte,motif_silence,cree_le")
      .order("cree_le", { ascending: false }).limit(400)
    if (error) tableManquante = true
    else logs = (data ?? []) as LogRow[]
  } catch { tableManquante = true }

  let pauses: { telephone: string; telephone_affiche: string; motif: string | null; cree_le: string }[] = []
  try {
    const { data } = await admin.from("wa_assistant_pauses")
      .select("telephone,telephone_affiche,motif,cree_le").order("cree_le", { ascending: false })
    pauses = (data ?? []) as typeof pauses
  } catch { /* table absente */ }

  const enPause = new Set(pauses.map(p => p.telephone))

  const parNumero = new Map<string, Conversation>()
  for (const l of logs) {
    const c = parNumero.get(l.telephone)
    if (c) { c.messages++; continue }
    parNumero.set(l.telephone, {
      telephone: l.telephone,
      affiche: l.affiche || l.telephone,
      dernier: l,
      messages: 1,
      enPause: enPause.has(l.telephone),
    })
  }

  // Une conversation mise en pause AVANT l'arrivée du journal n'a aucune ligne
  // de log : sans cela, elle deviendrait invisible et impossible à réactiver.
  for (const p of pauses) {
    if (parNumero.has(p.telephone)) continue
    parNumero.set(p.telephone, {
      telephone: p.telephone,
      affiche: p.telephone_affiche || p.telephone,
      dernier: {
        telephone: p.telephone, affiche: p.telephone_affiche, sens: "admin",
        texte: p.motif || "Mise en pause manuelle", motif_silence: "pause_conversation",
        cree_le: p.cree_le,
      },
      messages: 0,
      enPause: true,
    })
  }

  const conversations = [...parNumero.values()]
    .sort((a, b) => b.dernier.cree_le.localeCompare(a.dernier.cree_le))

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <Link href="/admin/whatsapp" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour WhatsApp
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Conversations de l&apos;assistante</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mettez une conversation en pause pour répondre vous-même depuis WhatsApp.
          Les autres clients continuent d&apos;être servis par l&apos;assistante.
        </p>
      </div>

      {tableManquante && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          La migration <code>057_assistant_wa_pauses.sql</code> n&apos;est pas encore appliquée :
          appliquez-la dans Supabase pour voir les conversations et pouvoir les mettre en pause.
        </div>
      )}

      <PauseManuelle />

      {enPause.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <PauseCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>{enPause.size}</strong> conversation{enPause.size > 1 ? "s" : ""} en pause.
            L&apos;assistante n&apos;y répond plus tant que vous ne lui rendez pas la main.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {conversations.length === 0 && !tableManquante && (
          <p className="text-sm text-gray-500">Aucune conversation enregistrée pour l&apos;instant.</p>
        )}

        {conversations.map(c => (
          <div key={c.telephone}
            className={`bg-white rounded-2xl border p-4 ${c.enPause ? "border-amber-300" : "border-gray-100"}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{c.affiche}</span>
                  {c.enPause && (
                    <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      En pause — vous répondez
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(c.dernier.cree_le)}</span>
                </div>

                <div className="flex items-start gap-2 mt-2">
                  {c.dernier.sens === "assistante"
                    ? <Bot className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    : <User className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
                  <p className="text-sm text-gray-600 line-clamp-2">{c.dernier.texte}</p>
                </div>

                {c.dernier.motif_silence && (
                  <p className="text-xs text-amber-700 mt-1.5">
                    Dernier message sans réponse : {MOTIF_LISIBLE[c.dernier.motif_silence] ?? c.dernier.motif_silence}
                  </p>
                )}

                {c.messages > 0 && (
                  <Link href={`/admin/whatsapp/conversations/${c.telephone}`}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:underline mt-2">
                    <MessageSquare className="w-3.5 h-3.5" /> Voir l&apos;échange
                  </Link>
                )}
              </div>

              <BasculePause telephone={c.affiche} enPause={c.enPause} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
