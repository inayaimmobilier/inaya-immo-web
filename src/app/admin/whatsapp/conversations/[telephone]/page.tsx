import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { ArrowLeft, Bot, User } from "lucide-react"
import type { UserRole } from "@/types/database"
import { formatDate } from "@/lib/utils"
import { BasculePause } from "../PauseControls"

export const metadata = { title: "Échange WhatsApp · Inaya Admin" }
export const dynamic = "force-dynamic"

interface LogRow {
  id: number
  affiche: string | null
  sens: "client" | "assistante" | "admin"
  texte: string
  motif_silence: string | null
  cree_le: string
}

const MOTIF_LISIBLE: Record<string, string> = {
  pause_globale: "assistante en pause pour tout le monde",
  aucun_agent_actif: "aucun agent IA WhatsApp actif",
  pause_conversation: "conversation reprise en main",
}

export default async function ConversationDetail(
  { params }: { params: Promise<{ telephone: string }> },
) {
  const { telephone } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/admin/whatsapp/conversations/${telephone}`)

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()

  // Ordre croissant : on lit une conversation du début vers la fin, comme dans
  // WhatsApp. Le `limit` porte donc sur les plus ANCIENS ; 200 messages
  // couvrent très largement un échange client.
  let messages: LogRow[] = []
  try {
    const { data } = await admin.from("wa_dm_log")
      .select("id,affiche,sens,texte,motif_silence,cree_le")
      .eq("telephone", telephone).order("cree_le", { ascending: true }).limit(200)
    messages = (data ?? []) as LogRow[]
  } catch { /* table absente */ }

  let enPause = false
  try {
    const { data } = await admin.from("wa_assistant_pauses")
      .select("telephone").eq("telephone", telephone).maybeSingle()
    enPause = data != null
  } catch { /* table absente */ }

  const affiche = messages.find(m => m.affiche)?.affiche || telephone

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <Link href="/admin/whatsapp/conversations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Toutes les conversations
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{affiche}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {messages.length} message{messages.length > 1 ? "s" : ""} enregistré{messages.length > 1 ? "s" : ""}
            </p>
          </div>
          <BasculePause telephone={affiche} enPause={enPause} />
        </div>
      </div>

      {enPause && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          L&apos;assistante ne répond plus à ce numéro. Répondez depuis WhatsApp ;
          rendez-lui la main quand vous avez terminé.
        </div>
      )}

      {messages.length === 0 && (
        <p className="text-sm text-gray-500">Aucun message enregistré pour ce numéro.</p>
      )}

      <div className="space-y-2">
        {messages.map(m => {
          const deLAssistante = m.sens === "assistante"
          return (
            <div key={m.id} className={`flex ${deLAssistante ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                deLAssistante ? "bg-blue-600 text-white" : "bg-white border border-gray-100 text-gray-800"
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {deLAssistante
                    ? <Bot className="w-3.5 h-3.5 opacity-80" />
                    : <User className="w-3.5 h-3.5 text-gray-400" />}
                  <span className={`text-[11px] ${deLAssistante ? "text-blue-100" : "text-gray-400"}`}>
                    {deLAssistante ? "Assistante" : m.sens === "admin" ? "Admin" : "Client"} · {formatDate(m.cree_le)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.texte}</p>
                {m.motif_silence && (
                  <p className="text-[11px] text-amber-700 mt-1.5 bg-amber-50 rounded-lg px-2 py-1">
                    Sans réponse : {MOTIF_LISIBLE[m.motif_silence] ?? m.motif_silence}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
