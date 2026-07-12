"use client"

import { useState, useTransition } from "react"
import { PhoneCall, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { setGupshupLine } from "./gupshup-actions"

/**
 * Bascule du numéro d'envoi Gupshup : « Principal » ↔ « Secours ».
 *  - `active`            : ligne enregistrée dans app_settings (source de vérité).
 *  - `serviceLine`       : ligne réellement utilisée par le service (via /health) —
 *                          peut différer quelques secondes le temps que le cache expire.
 *  - `secoursConfigured` : la ligne de secours a-t-elle ses variables (*_2) sur Railway.
 */
export default function GupshupLineToggle({
  active, serviceLine, secoursConfigured,
}: {
  active: "principal" | "secours"
  serviceLine: "principal" | "secours" | null
  secoursConfigured: boolean
}) {
  const [current, setCurrent] = useState(active)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function choose(next: "principal" | "secours") {
    if (next === current || pending) return
    if (next === "secours" && !secoursConfigured) {
      setErr("Aucun numéro de secours configuré (variables GUPSHUP_*_2 sur Railway).")
      return
    }
    setErr(null)
    start(async () => {
      const res = await setGupshupLine(next)
      if (!res.ok) { setErr(res.error); return }
      setCurrent(next)
    })
  }

  const onSecours = current === "secours"
  const serviceLag = serviceLine != null && serviceLine !== current

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${onSecours ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
          <PhoneCall className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-900">Numéro d&apos;envoi WhatsApp (Gupshup)</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-md">
            Si Meta restreint le numéro principal, basculez sur le numéro de secours pour que les
            envois (OTP, alertes, relances) repartent. Rebasculez sur le principal une fois la restriction levée.
          </p>
        </div>
      </div>

      {/* Contrôle segmenté */}
      <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
        {(["principal", "secours"] as const).map(opt => {
          const selected = current === opt
          const disabled = pending || (opt === "secours" && !secoursConfigured)
          return (
            <button key={opt} onClick={() => choose(opt)} disabled={disabled}
              role="radio" aria-checked={selected}
              className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50
                ${selected
                  ? opt === "secours" ? "bg-amber-500 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"}`}>
              {opt === "principal" ? "Principal" : "Secours"}
              {pending && selected && <Loader2 className="inline w-3.5 h-3.5 ml-1.5 animate-spin" />}
            </button>
          )
        })}
      </div>

      <p className={`text-xs font-medium flex items-center gap-1.5 ${onSecours ? "text-amber-700" : "text-blue-700"}`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        {onSecours ? "Envois via le numéro de SECOURS." : "Envois via le numéro PRINCIPAL."}
      </p>

      {serviceLag && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Application au service en cours (≤ 30 s)…
        </p>
      )}
      {!secoursConfigured && (
        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2">
          Numéro de secours non configuré. Ajoutez sur Railway : <code>GUPSHUP_API_KEY_2</code>, <code>GUPSHUP_SOURCE_2</code>,
          <code>GUPSHUP_APP_NAME_2</code> et les <code>GUPSHUP_TEMPLATE_*_2</code> (templates re-créés sur la 2e app Gupshup).
        </p>
      )}
      {err && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
    </div>
  )
}
