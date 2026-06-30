"use client"

import { useState, useEffect, useCallback } from "react"
import { Wifi, WifiOff, Send, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react"

interface AccountHealth { id: string; numero: string; connected: boolean; engine: string }
interface HealthData { serviceRunning: boolean; accounts: AccountHealth[] }

export default function WaDiagnostic() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  const [to, setTo] = useState("")
  const [msg, setMsg] = useState("Bonjour, ceci est un message de test INAYA.")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; error?: string; jid?: string; phoneChecked?: string } | null>(null)

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch("/api/admin/whatsapp/service-health", { cache: "no-store" })
      const data = await res.json() as HealthData
      setHealth(data)
    } catch {
      setHealth({ serviceRunning: false, accounts: [] })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  async function sendDirect() {
    const numero = to.replace(/\s/g, "")
    if (!numero || !msg.trim()) return
    setSending(true)
    setResult(null)
    // Vérifie que le service est toujours actif au moment de cliquer (pas de stale-state du health check)
    const freshHealth = await fetch("/api/admin/whatsapp/service-health", { cache: "no-store" })
      .then(r => r.json() as Promise<HealthData>).catch(() => null)
    if (!freshHealth?.serviceRunning) {
      setHealth(freshHealth ?? { serviceRunning: false, accounts: [] })
      setSending(false)
      setResult({ ok: false, error: "Service non démarré — relancez avec : pm2 restart inaya-whatsapp-service" })
      return
    }
    setHealth(freshHealth)
    try {
      const res = await fetch("/api/admin/whatsapp/send-direct", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: numero, text: msg }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; serviceRunning?: boolean; jid?: string; phoneChecked?: string }
      if (data.serviceRunning === false) setHealth({ serviceRunning: false, accounts: [] })
      setResult({ ok: !!data.ok, error: data.error, jid: data.jid, phoneChecked: data.phoneChecked })
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const anyConnected = health?.accounts.some(a => a.connected)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Diagnostic envoi WhatsApp</h2>
        <button onClick={fetchHealth} disabled={healthLoading}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {/* Statut service */}
      {healthLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Vérification du service…
        </div>
      ) : !health?.serviceRunning ? (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-3">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Service WhatsApp non démarré</p>
            <p className="text-red-600">Les notifications WhatsApp ne peuvent pas être envoyées.</p>
            <code className="block mt-1 bg-red-100 rounded px-2 py-1 font-mono">
              pm2 restart inaya-whatsapp-service
            </code>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Service démarré
            {!anyConnected && (
              <span className="text-amber-600 font-medium ml-1">— aucun compte connecté</span>
            )}
          </div>

          {/* Liste des comptes */}
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {health.accounts.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-2">Aucun compte chargé dans le service.</p>
            ) : health.accounts.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                {a.connected
                  ? <Wifi className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  : <WifiOff className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                <span className="font-mono text-xs text-gray-700 flex-1">{a.numero}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  a.connected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {a.connected ? "Connecté" : "Déconnecté"}
                </span>
                <span className="text-[11px] text-gray-400">{a.engine}</span>
              </div>
            ))}
          </div>

          {!anyConnected && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Aucun compte connecté → les notifications WhatsApp sont différées.
                Utilisez le bouton <strong>Connecter</strong> dans le tableau ci-dessous pour appairer un compte.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Test d'envoi direct */}
      {health?.serviceRunning && (
        <div className="border-t border-gray-50 pt-4 space-y-3">
          <p className="text-xs font-medium text-gray-700">Tester l&apos;envoi direct (bypass base de données)</p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="+225 07 00 00 00"
              className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 outline-none focus:border-blue-400"
            />
          </div>
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 outline-none focus:border-blue-400 resize-none"
          />
          <button
            onClick={sendDirect}
            disabled={sending || !to.trim() || !msg.trim()}
            className="flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Envoi…" : "Envoyer message test"}
          </button>

          {result && (
            <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 ${
              result.ok ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
              {result.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <div className="space-y-0.5">
                {result.ok ? (
                  <>
                    <p className="font-medium">Message envoyé par Baileys ✓</p>
                    {result.jid && <p className="text-green-600 font-mono">{result.jid}</p>}
                    <p className="text-green-600">
                      Vérifiez que le message apparaît dans vos chats WhatsApp envoyés.
                      S&apos;il est absent → la session est corrompue → re-scanner le QR ou générer un nouveau code d&apos;appairage.
                    </p>
                  </>
                ) : result.phoneChecked ? (
                  <>
                    <p className="font-medium">{result.error}</p>
                    <p className="font-mono text-red-500">{result.phoneChecked}</p>
                  </>
                ) : (
                  <span>{result.error ?? "Erreur inconnue"}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
