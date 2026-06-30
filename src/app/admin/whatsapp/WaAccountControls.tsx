"use client"

import { useState, useTransition } from "react"
import { Loader2, Trash2, Send, RotateCcw } from "lucide-react"
import { updateWaEngine, toggleWaAccount, deleteWaAccount, setNotifierAccount } from "./actions"
import type { WaEngine } from "@/types/database"

const ENGINE_LABEL: Record<WaEngine, string> = {
  baileys: "Baileys",
  wppconnect: "WPPConnect",
  whatsmeow: "whatsmeow",
  whatsapp_web_js: "whatsapp-web.js",
  venom_bot: "Venom Bot",
  api_officielle: "API officielle (Cloud)",
  waapi: "WaAPI",
  twilio: "Twilio",
}
const ENGINES = Object.keys(ENGINE_LABEL) as WaEngine[]

export default function WaAccountControls({
  id, engine, actif, role,
}: {
  id: string; engine: WaEngine; actif: boolean; role: "ingestion" | "notifier"
}) {
  const [eng, setEng] = useState<WaEngine>(engine)
  const [on, setOn] = useState(actif)
  const [currentRole, setCurrentRole] = useState(role)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  function onEngine(next: WaEngine) {
    const prev = eng; setEng(next); setErr(null)
    startTransition(async () => {
      const res = await updateWaEngine(id, next)
      if (!res.ok) { setEng(prev); setErr(res.error) }
    })
  }

  function onToggle() {
    const next = !on; setOn(next); setErr(null)
    startTransition(async () => {
      const res = await toggleWaAccount(id, next)
      if (!res.ok) { setOn(!next); setErr(res.error) }
    })
  }

  function onDelete() {
    if (!confirm("Supprimer ce compte WhatsApp ?")) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteWaAccount(id)
      if (!res.ok) setErr(res.error)
    })
  }

  async function onResetSession() {
    if (!confirm("Réinitialiser la session WhatsApp ? Le compte devra être réappairé (QR ou code).")) return
    setErr(null); setResetMsg(null)
    try {
      const res = await fetch(`/api/admin/whatsapp/${id}/reset-session`, { method: "POST" })
      const data = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (data.ok) setResetMsg(data.message ?? "Session réinitialisée — scannez le QR.")
      else setErr(data.error ?? "Échec de la réinitialisation")
    } catch {
      setErr("Service non accessible — redémarrez le service WhatsApp.")
    }
  }

  function onSetNotifier() {
    if (!confirm("Définir ce compte comme notificateur INAYA ? Tous les autres comptes repasseront en mode ingestion.")) return
    setErr(null)
    startTransition(async () => {
      const res = await setNotifierAccount(id)
      if (!res.ok) { setErr(res.error); return }
      setCurrentRole("notifier")
    })
  }

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      {err && <span title={err} className="text-xs text-red-500 cursor-help" onClick={() => alert(err)}>⚠ {err.slice(0, 40)}</span>}
      {resetMsg && <span className="text-xs text-blue-600">{resetMsg}</span>}
      {pending && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}

      {/* Badge / bouton rôle */}
      {currentRole === "notifier" ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          <Send className="w-3 h-3" /> NOTIFICATEUR
        </span>
      ) : (
        <button type="button" onClick={onSetNotifier} disabled={pending}
          title="Désigner ce compte comme émetteur officiel des notifications INAYA (leads assignés, alertes agents…)"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-50">
          <Send className="w-3 h-3" /> Notificateur
        </button>
      )}

      <select
        value={eng}
        disabled={pending}
        onChange={e => onEngine(e.target.value as WaEngine)}
        className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white outline-none focus:border-blue-400 disabled:opacity-50"
      >
        {ENGINES.map(en => <option key={en} value={en}>{ENGINE_LABEL[en]}</option>)}
      </select>

      <button
        type="button" onClick={onToggle} disabled={pending}
        title={on ? "Désactiver" : "Activer"}
        className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-green-500" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${on ? "translate-x-4" : ""}`} />
      </button>

      <button type="button" onClick={onResetSession} disabled={pending}
        title="Réinitialiser la session WA (efface les credentials → re-pairing QR requis)"
        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50">
        <RotateCcw className="w-4 h-4" />
      </button>

      <button type="button" onClick={onDelete} disabled={pending} title="Supprimer"
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
