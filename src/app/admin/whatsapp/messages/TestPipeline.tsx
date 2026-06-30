"use client"

import { useState } from "react"
import { FlaskConical, Send, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react"

type Result =
  | { ok: true; text: string }
  | { ok: false; error: string; serviceRunning?: boolean }
  | null

export default function TestPipeline({ accountId }: { accountId: string | null }) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result>(null)
  const [health, setHealth] = useState<"unknown" | "ok" | "down">("unknown")

  async function checkHealth() {
    try {
      const res = await fetch("/api/admin/whatsapp/service-health")
      const data = await res.json() as { serviceRunning: boolean; accounts?: { connected: boolean }[] }
      setHealth(data.serviceRunning ? "ok" : "down")
      return data.serviceRunning
    } catch {
      setHealth("down")
      return false
    }
  }

  async function sendTest() {
    if (!text.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const up = await checkHealth()
      if (!up) {
        setResult({ ok: false, error: "Le service whatsapp-service n'est pas démarré.", serviceRunning: false })
        return
      }
      const res = await fetch("/api/admin/whatsapp/test-message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, accountId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; serviceRunning?: boolean }
      if (data.ok) {
        setResult({ ok: true, text })
        setText("")
      } else {
        setResult({ ok: false, error: data.error ?? "Erreur inconnue", serviceRunning: data.serviceRunning })
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-blue-600" />
          Tester le pipeline d&apos;ingestion
        </h2>
        <button
          onClick={checkHealth}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          {health === "ok" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
          {health === "down" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />}
          {health === "unknown" && <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />}
          {health === "ok" ? "Service actif" : health === "down" ? "Service hors ligne" : "Vérifier le service"}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Injectez un message fictif directement dans le pipeline (classification IA + création d&apos;annonce) sans passer par WhatsApp.
        Idéal pour vérifier que le pipeline fonctionne indépendamment de la connexion WhatsApp.
      </p>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          placeholder={`Ex: À louer F3 quartier Commerce Bouaké, 2 chambres, salon, cuisine équipée, eau + élec.
Prix: 80 000 FCFA/mois. Contact: 07 XX XX XX XX`}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-gray-50 placeholder:text-gray-300 outline-none focus:border-blue-400 focus:bg-white resize-none font-mono"
        />
        <button
          onClick={sendTest}
          disabled={loading || !text.trim()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? "Envoi en cours…" : "Envoyer au pipeline"}
        </button>
      </div>

      {result !== null && (
        <div className={`rounded-xl px-4 py-3 flex items-start gap-2.5 ${
          result.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
        }`}>
          {result.ok
            ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            : result.serviceRunning === false
              ? <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          }
          <div>
            {result.ok ? (
              <>
                <p className="text-sm font-medium text-green-800">Message envoyé au pipeline</p>
                <p className="text-xs text-green-600 mt-0.5">
                  Vérifiez le tableau ci-dessous dans quelques secondes pour voir le résultat de la classification et l&apos;annonce créée.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-red-800">
                  {result.serviceRunning === false ? "Service non démarré" : "Erreur"}
                </p>
                <p className="text-xs text-red-600 mt-0.5">{result.error}</p>
                {result.serviceRunning === false && (
                  <p className="text-xs text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    Démarrez le service :{" "}
                    <code className="font-mono">cd whatsapp-service && npm run dev</code>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
