"use client"

import { useState, useEffect, useRef } from "react"
import { MapPin, Plus, Trash2, RefreshCw, Eye, EyeOff, ChevronRight } from "lucide-react"

interface Ville { id: string; nom: string; actif: boolean; ordre: number }
interface Quartier { id: string; nom: string; actif: boolean; ordre: number }

export default function ZonesManager({ initial }: { initial: Ville[] }) {
  const [villes, setVilles] = useState<Ville[]>(initial)
  const [selected, setSelected] = useState<Ville | null>(initial[0] ?? null)
  const [quartiers, setQuartiers] = useState<Quartier[]>([])
  const [loadingQ, setLoadingQ] = useState(false)
  const [newVille, setNewVille] = useState("")
  const [newQ, setNewQ] = useState("")
  const [saving, setSaving] = useState(false)
  const villeInputRef = useRef<HTMLInputElement>(null)
  const qInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selected) fetchQuartiers(selected.id)
  }, [selected])

  async function fetchQuartiers(villeId: string) {
    setLoadingQ(true)
    try {
      const res = await fetch(`/api/admin/zones/quartiers?ville_id=${villeId}`)
      const data = await res.json()
      // L'API renvoie un tableau en succès, mais un objet { error } si la vérif échoue.
      setQuartiers(Array.isArray(data) ? data as Quartier[] : [])
    } catch {
      setQuartiers([])
    } finally {
      setLoadingQ(false)
    }
  }

  async function addVille(e: React.FormEvent) {
    e.preventDefault()
    if (!newVille.trim()) return
    setSaving(true)
    const res = await fetch("/api/admin/zones/villes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nom: newVille.trim() }),
    })
    if (res.ok) {
      const v = await res.json() as Ville
      setVilles(prev => [...prev, v])
      setSelected(v)
      setNewVille("")
    }
    setSaving(false)
  }

  async function toggleVille(v: Ville) {
    const res = await fetch(`/api/admin/zones/villes/${v.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actif: !v.actif }),
    })
    if (res.ok) setVilles(prev => prev.map(x => x.id === v.id ? { ...x, actif: !x.actif } : x))
  }

  async function deleteVille(v: Ville) {
    if (!confirm(`Supprimer "${v.nom}" et tous ses quartiers ?`)) return
    const res = await fetch(`/api/admin/zones/villes/${v.id}`, { method: "DELETE" })
    if (res.ok) {
      setVilles(prev => prev.filter(x => x.id !== v.id))
      if (selected?.id === v.id) { setSelected(villes.find(x => x.id !== v.id) ?? null); setQuartiers([]) }
    }
  }

  async function addQuartier(e: React.FormEvent) {
    e.preventDefault()
    if (!newQ.trim() || !selected) return
    setSaving(true)
    const res = await fetch("/api/admin/zones/quartiers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ville_id: selected.id, nom: newQ.trim() }),
    })
    if (res.ok) {
      const q = await res.json() as Quartier
      setQuartiers(prev => [...prev, q])
      setNewQ("")
      qInputRef.current?.focus()
    }
    setSaving(false)
  }

  async function toggleQuartier(q: Quartier) {
    const res = await fetch(`/api/admin/zones/quartiers/${q.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actif: !q.actif }),
    })
    if (res.ok) setQuartiers(prev => prev.map(x => x.id === q.id ? { ...x, actif: !x.actif } : x))
  }

  async function deleteQuartier(q: Quartier) {
    const res = await fetch(`/api/admin/zones/quartiers/${q.id}`, { method: "DELETE" })
    if (res.ok) setQuartiers(prev => prev.filter(x => x.id !== q.id))
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Colonne villes */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Villes</h2>
          <span className="text-xs text-gray-400 ml-auto">{villes.filter(v => v.actif).length} actives</span>
        </div>

        <ul className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
          {villes.length === 0 && (
            <li className="px-5 py-6 text-sm text-gray-400 text-center">Aucune ville configurée.</li>
          )}
          {villes.map(v => (
            <li key={v.id}
              onClick={() => setSelected(v)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group
                ${selected?.id === v.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${selected?.id === v.id ? "text-blue-600" : "text-gray-300"}`} />
              <span className={`flex-1 text-sm font-medium ${v.actif ? "text-gray-900" : "text-gray-400 line-through"}`}>
                {v.nom}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); toggleVille(v) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                  title={v.actif ? "Désactiver" : "Activer"}>
                  {v.actif ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={e => { e.stopPropagation(); deleteVille(v) }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                  title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={addVille} className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
          <input ref={villeInputRef} value={newVille} onChange={e => setNewVille(e.target.value)}
            placeholder="Nouvelle ville…" maxLength={60}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400" />
          <button type="submit" disabled={saving || !newVille.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>

      {/* Colonne quartiers */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Quartiers{selected ? ` — ${selected.nom}` : ""}
          </h2>
          {loadingQ && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400 ml-auto" />}
          {!loadingQ && <span className="text-xs text-gray-400 ml-auto">{quartiers.filter(q => q.actif).length} actifs</span>}
        </div>

        {!selected ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">Sélectionne une ville pour gérer ses quartiers.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {quartiers.length === 0 && !loadingQ && (
                <li className="px-5 py-6 text-sm text-gray-400 text-center">Aucun quartier pour cette ville.</li>
              )}
              {quartiers.map(q => (
                <li key={q.id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-gray-50">
                  <span className={`flex-1 text-sm ${q.actif ? "text-gray-800" : "text-gray-400 line-through"}`}>
                    {q.nom}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleQuartier(q)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                      title={q.actif ? "Désactiver" : "Activer"}>
                      {q.actif ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteQuartier(q)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                      title="Supprimer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <form onSubmit={addQuartier} className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
              <input ref={qInputRef} value={newQ} onChange={e => setNewQ(e.target.value)}
                placeholder="Nouveau quartier…" maxLength={80}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400" />
              <button type="submit" disabled={saving || !newQ.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
