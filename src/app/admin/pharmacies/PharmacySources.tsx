"use client"

import { useEffect, useState } from "react"
import { loadSources, saveSources, collectNow } from "./actions"

// Sources d'où l'agent IA récupère chaque jour les pharmacies de garde + collecte manuelle.
export default function PharmacySources() {
  const [text, setText] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { void loadSources().then(u => { setText(u.join("\n")); setLoaded(true) }) }, [])

  const urls = () => text.split("\n").map(s => s.trim()).filter(Boolean)

  async function save() {
    setSaving(true); setMsg(null)
    const r = await saveSources(urls())
    setSaving(false)
    setMsg(r.ok ? "Sources enregistrées." : r.error)
  }

  async function run() {
    setRunning(true); setMsg(null)
    const r = await collectNow()
    setRunning(false)
    setMsg(r.ok
      ? `Collecte terminée : ${r.count} pharmacie(s) depuis ${r.sources} source(s).${r.errors.length ? " Avertissements : " + r.errors.join(" ; ") : ""}`
      : `Échec : ${r.errors.join(" ; ")}`)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Collecte automatique (IA)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Une URL par ligne. Chaque jour, l&apos;agent IA lit ces pages et met à jour la garde du jour.
          Nécessite un fournisseur LLM configuré dans Paramètres → Assistant IA.
        </p>
      </div>
      <textarea
        value={loaded ? text : "Chargement…"} onChange={e => setText(e.target.value)} rows={4}
        placeholder={"https://exemple.ci/pharmacies-de-garde\nhttps://autre-source.ci/garde"}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 resize-y" />
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving || !loaded}
          className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
          {saving ? "…" : "Enregistrer les sources"}
        </button>
        <button onClick={run} disabled={running || !loaded}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
          {running ? "Collecte en cours…" : "Collecter maintenant"}
        </button>
      </div>
      {msg && <p className="text-xs bg-gray-50 text-gray-700 rounded-lg px-3 py-2">{msg}</p>}
    </div>
  )
}
