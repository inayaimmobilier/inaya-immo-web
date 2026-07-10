import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Bell, BellRing, ArrowRight, Home } from "lucide-react"
import { formatRelativeDate } from "@/lib/utils"
import { markAllRead } from "./actions"

export const metadata = { title: "Mes alertes · Inaya Immo" }
export const dynamic = "force-dynamic"

interface NotifRow {
  id: string; type: string; titre: string | null; contenu: string; lu: boolean
  created_at: string; payload: { property_id?: string; match_type?: string } | null
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Notifications du client (RLS : user_id = auth.uid()). On dédoublonne les
  // alertes de match (une même annonce génère une notif push + une WhatsApp).
  const { data } = await supabase
    .from("notifications")
    .select("id,type,titre,contenu,lu,created_at,payload")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(100)
  const all = (data ?? []) as NotifRow[]

  const seen = new Set<string>()
  const notifs = all.filter(n => {
    const key = `${n.type}:${n.payload?.property_id ?? n.id}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  const unread = notifs.filter(n => !n.lu).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Vos alertes : nous vous prévenons dès qu&apos;un bien correspond à une recherche sauvegardée.
        </p>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="text-xs font-medium text-blue-700 hover:text-blue-800">Tout marquer comme lu</button>
          </form>
        )}
      </div>

      {notifs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucune alerte pour le moment.</p>
          <Link href="/client/mes-requetes" className="inline-block mt-3 text-sm text-blue-700 font-medium hover:text-blue-800">
            Créer une recherche pour être alerté →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const propId = n.payload?.property_id ?? null
            const inner = (
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.lu ? "bg-gray-100 text-gray-400" : "bg-blue-100 text-blue-600"}`}>
                  {n.type === "match_offre" ? <BellRing className="w-4 h-4" /> : <Home className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{n.titre || "Notification"}</p>
                    {!n.lu && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{n.contenu}</p>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-[11px] text-gray-400">{formatRelativeDate(n.created_at)}</span>
                    {propId && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700">
                        Voir l&apos;annonce <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
            const cls = `block rounded-2xl border p-4 transition-colors ${
              n.lu ? "bg-white border-gray-100" : "bg-blue-50/50 border-blue-100"
            } ${propId ? "hover:border-blue-300" : ""}`
            return propId
              ? <Link key={n.id} href={`/biens/${propId}`} className={cls}>{inner}</Link>
              : <div key={n.id} className={cls}>{inner}</div>
          })}
        </div>
      )}
    </div>
  )
}
