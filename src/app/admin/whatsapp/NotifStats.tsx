"use client"

import { useState, useTransition } from "react"
import { Bell, RefreshCw, CheckCircle2, AlertCircle, Clock, Loader2, Zap, Ban } from "lucide-react"
import { retryFailedNotifications, cancelPendingMatchAlerts } from "./actions"
import NotifDetails from "./NotifDetails"

interface Props {
  pending: number   // envoye=false, code_erreur IS NULL
  errored: number   // envoye=false, code_erreur IS NOT NULL
  sent24h: number   // envoye=true, envoye_le > now()-24h
}

export default function NotifStats({ pending, errored, sent24h }: Props) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)

  function retry() {
    setMsg(null)
    startTransition(async () => {
      const res = await retryFailedNotifications()
      if (res.ok) {
        setMsg(res.count === 0
          ? "Aucune notification bloquée à remettre."
          : `${res.count} notification(s) remises en file d'attente.`)
      } else {
        setMsg(res.error)
      }
    })
  }

  function cancelMatchAlerts() {
    if (!confirm("Annuler toutes les alertes de biens « Nouveau bien pour vous » en attente ? Elles ne seront pas envoyées. (Sans effet sur les OTP, tâches et autres notifications.)")) return
    setMsg(null)
    startTransition(async () => {
      const res = await cancelPendingMatchAlerts()
      if (res.ok) {
        setMsg(res.count === 0
          ? "Aucune alerte de bien en attente à annuler."
          : `${res.count} alerte(s) de biens annulée(s) — elles ne partiront pas.`)
      } else {
        setMsg(res.error)
      }
    })
  }

  async function dispatchNow() {
    setDispatching(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/whatsapp/dispatch-now", { method: "POST" })
      const data = await res.json() as { ok?: boolean; error?: string }
      setMsg(data.ok
        ? "Cycle de dispatch forcé — rechargez la page dans 5 secondes pour voir les résultats."
        : (data.error ?? "Erreur inconnue"))
    } catch {
      setMsg("Impossible de joindre le service WhatsApp.")
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <Bell className="w-4 h-4 text-blue-600" /> Notifications WhatsApp
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <Clock className="w-4 h-4 text-amber-600 mx-auto mb-1" />
          <p className="text-xl font-bold text-amber-700">{pending}</p>
          <p className="text-[11px] text-amber-600">En attente</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${errored > 0 ? "bg-red-50" : "bg-gray-50"}`}>
          <AlertCircle className={`w-4 h-4 mx-auto mb-1 ${errored > 0 ? "text-red-600" : "text-gray-400"}`} />
          <p className={`text-xl font-bold ${errored > 0 ? "text-red-700" : "text-gray-500"}`}>{errored}</p>
          <p className={`text-[11px] ${errored > 0 ? "text-red-600" : "text-gray-400"}`}>En erreur</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto mb-1" />
          <p className="text-xl font-bold text-green-700">{sent24h}</p>
          <p className="text-[11px] text-green-600">Envoyées (24h)</p>
        </div>
      </div>

      {pending > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 space-y-2">
          <div className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {pending} notification(s) en attente. Le dispatcher tente l&apos;envoi toutes les 15 s.
              Si le service tourne et qu&apos;un compte est connecté, les détails ci-dessous révèlent l&apos;erreur exacte.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={dispatchNow} disabled={dispatching || isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors disabled:opacity-50">
              {dispatching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Forcer l&apos;envoi maintenant
            </button>
            <button onClick={cancelMatchAlerts} disabled={isPending || dispatching}
              className="flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-50"
              title="Annule les alertes « Nouveau bien pour vous » en attente (anti-spam). Sans effet sur les OTP et tâches.">
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
              Annuler les alertes de biens en attente
            </button>
          </div>
          <NotifDetails initialCount={pending} />
        </div>
      )}

      {errored > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {errored} notification(s) bloquées (numéro manquant au moment de l&apos;envoi).
              Vérifiez que les agents ont un numéro WhatsApp dans leur profil, puis cliquez &quot;Réessayer&quot;.
            </span>
          </div>
          <button
            onClick={retry}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Remettre en file d&apos;attente ({errored})
          </button>
        </div>
      )}

      {msg && (
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{msg}</p>
      )}
    </div>
  )
}
