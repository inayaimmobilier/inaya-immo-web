import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Bell, MessageSquare, Home, TrendingUp, Send, Clock } from "lucide-react"
import { formatRelativeDate } from "@/lib/utils"
import type { UserRole, NotifCanal } from "@/types/database"
import AutoRefresh from "@/components/shared/AutoRefresh"

export const metadata = { title: "Notifications · Inaya Immo" }
// Données temps réel : jamais de cache, toujours frais.
export const dynamic = "force-dynamic"

interface NotifRow {
  id: string; canal: NotifCanal; type: string; titre: string | null
  contenu: string; lu: boolean; envoye: boolean; envoye_le: string | null
  erreur: string | null; created_at: string
}

const TYPE_ICON: Record<string, typeof Bell> = {
  nouveau_lead: MessageSquare,
  nouveau_bien: Home,
  match_offre: TrendingUp,
}

const CANAL_BADGE: Record<NotifCanal, string> = {
  push: "bg-indigo-50 text-indigo-700",
  email: "bg-gray-100 text-gray-600",
  whatsapp: "bg-green-50 text-green-700",
  telegram: "bg-sky-50 text-sky-700",
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/notifications")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (!["super_admin", "admin", "moderateur", "agent"].includes(myRole)) redirect("/")

  // Notifications destinées à l'utilisateur courant
  const { data } = await supabase
    .from("notifications")
    .select("id,canal,type,titre,contenu,lu,envoye,envoye_le,erreur,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
  const notifs = (data ?? []) as NotifRow[]

  const enAttente = notifs.filter(n => !n.envoye && !n.erreur).length

  return (
    <div className="p-6 space-y-6">
      <AutoRefresh intervalMs={15_000} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="w-6 h-6 text-blue-600" /> Notifications
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {notifs.length} notification{notifs.length > 1 ? "s" : ""}
          {enAttente > 0 ? ` · ${enAttente} en attente d'envoi` : ""}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {notifs.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucune notification pour l&apos;instant.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {notifs.map(n => {
              const Icon = TYPE_ICON[n.type] ?? Bell
              return (
                <li key={n.id} className={`flex items-start gap-3 px-5 py-4 hover:bg-gray-50/60 transition-colors ${!n.lu ? "bg-blue-50/30" : ""}`}>
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{n.titre ?? n.type}</p>
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${CANAL_BADGE[n.canal]}`}>{n.canal}</span>
                      {!n.lu && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{n.contenu}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>{formatRelativeDate(n.created_at)}</span>
                      {n.envoye ? (
                        <span className="flex items-center gap-1 text-green-600"><Send className="w-3 h-3" /> envoyée</span>
                      ) : n.erreur ? (
                        <span className="text-red-500">échec : {n.erreur}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600"><Clock className="w-3 h-3" /> en attente d&apos;envoi</span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Les notifications sont créées ici puis acheminées vers WhatsApp / Telegram / app interne Pi par le service
        d&apos;envoi. Les lignes « en attente » seront expédiées au prochain passage du dispatcher.
      </p>
    </div>
  )
}
