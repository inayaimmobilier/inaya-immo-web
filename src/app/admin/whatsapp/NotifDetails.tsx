"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Phone, AlertTriangle, Clock } from "lucide-react"

interface NotifRow {
  id: string
  type: string | null
  titre: string | null
  contenu: string
  contact_telephone: string | null
  user_id: string | null
  erreur: string | null
  created_at: string
}

export default function NotifDetails({ initialCount }: { initialCount: number }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotifRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (rows) { setOpen(o => !o); return }
    setLoading(true)
    try {
      const res = await fetch("/api/admin/whatsapp/pending-notifs", { cache: "no-store" })
      const data = await res.json() as { rows: NotifRow[] }
      setRows(data.rows ?? [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  if (initialCount === 0) return null

  return (
    <div className="mt-3">
      <button onClick={load} disabled={loading}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">
        {loading ? <Clock className="w-3.5 h-3.5 animate-pulse" /> : open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? "Masquer" : `Voir les ${initialCount} notifications en attente`}
      </button>

      {open && rows && (
        <div className="mt-2 divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">Aucune notification en attente.</p>
          ) : rows.map(r => (
            <div key={r.id} className="px-3 py-2.5 space-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-gray-800 truncate">{r.titre ?? r.contenu.slice(0, 60)}</p>
                <span className="text-[11px] text-gray-400 shrink-0">
                  {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span className="bg-gray-100 rounded px-1.5 py-0.5 font-mono">{r.type ?? "—"}</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {r.contact_telephone
                    ? <span className="font-mono text-gray-600">{r.contact_telephone}</span>
                    : <span className="text-red-500 font-medium">Numéro manquant</span>}
                </span>
              </div>
              {!r.contact_telephone && r.user_id && (
                <div className="flex items-center gap-1 text-[11px] text-amber-700 mt-0.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>
                    Agent sans numéro WhatsApp →{" "}
                    <a href={`/admin/utilisateurs?id=${r.user_id}`}
                      className="underline hover:text-amber-900">
                      Modifier le profil
                    </a>
                  </span>
                </div>
              )}
              {r.erreur && (
                <div className="flex items-start gap-1 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="break-all">{r.erreur}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
