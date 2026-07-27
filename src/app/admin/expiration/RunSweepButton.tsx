"use client"

import { useState } from "react"
import { runExpiryNow } from "./actions"

export default function RunSweepButton() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function run() {
    setBusy(true); setMsg(null)
    const r = await runExpiryNow()
    setBusy(false)
    setMsg(r.ok
      ? `Balayage terminé : ${r.expired} annonce(s) expirée(s)${r.backfilled ? `, ${r.backfilled} date(s) d'expiration calculée(s)` : ""} (${r.rules} règle(s) active(s)).`
      : `Échec : ${r.error}`)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-semibold text-gray-900">Expiration automatique</p>
        <p className="text-xs text-gray-500">Passe en « expirée » les annonces dont la durée de vie est dépassée. S&apos;exécute chaque nuit (02h) — ou immédiatement ici.</p>
      </div>
      <button onClick={run} disabled={busy}
        className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 shrink-0">
        {busy ? "Balayage…" : "Lancer le balayage maintenant"}
      </button>
      {msg && <p className="text-xs bg-gray-50 text-gray-700 rounded-lg px-3 py-2 w-full">{msg}</p>}
    </div>
  )
}
