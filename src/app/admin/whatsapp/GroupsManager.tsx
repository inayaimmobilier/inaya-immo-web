"use client"

import { useState } from "react"
import { Users, X, Save, RefreshCw, Check } from "lucide-react"

interface Group {
  id: string
  nom: string
  nb_participants: number | null
  commune_prioritaire?: string | null
}

interface Props {
  accountId: string
  watched: { id: string; nom?: string }[]   // groupes_surveilles courants
  /** Communes connues, pour le réglage de priorité. */
  communes?: string[]
  /** Nombre de groupes de ce compte ayant déjà une commune prioritaire. */
  prioritesReglees?: number
}

export default function GroupsManager({ accountId, watched, communes = [], prioritesReglees = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(watched.map(g => g.id)))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openModal() {
    setOpen(true)
    setSaved(false)
    setError(null)
    await fetchGroups()
  }

  async function fetchGroups() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/whatsapp/${accountId}/groups`)
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as Group[]
      setGroups(data)
      // réinitialise la sélection depuis la prop watched + les groupes récupérés
      setSelected(new Set(watched.map(g => g.id)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // La priorité est enregistrée AU CHOIX, sans passer par « Enregistrer » :
  // ce bouton-là ne concerne que les groupes surveillés, et faire porter deux
  // réglages différents au même bouton ferait croire qu'annuler annule tout.
  async function changerCommune(groupId: string, commune: string) {
    setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, commune_prioritaire: commune || null } : g)))
    setError(null)
    try {
      const res = await fetch(`/api/admin/whatsapp/${accountId}/groups`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId, commune: commune || null }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Échec")
    } catch (e) {
      setError((e as Error).message)
      await fetchGroups()   // l'affichage doit refléter la base, pas un espoir
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const groupes = groups
        .filter(g => selected.has(g.id))
        .map(g => ({ id: g.id, nom: g.nom }))
      const res = await fetch(`/api/admin/whatsapp/${accountId}/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupes }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setOpen(false), 800)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const watchedCount = watched.length

  return (
    <>
      {/* Le libellé disait seulement « 26 groupes » : rien n'indiquait qu'on
          pouvait cliquer, ni que la commune prioritaire se réglait là-dedans.
          Le réglage existait sans que personne puisse le trouver. */}
      <button onClick={openModal} className="text-left group/btn">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 group-hover/btn:text-blue-800 group-hover/btn:underline">
          <Users className="w-3.5 h-3.5" />
          Groupes surveillés{watchedCount > 0 ? ` · ${watchedCount}` : " · tous"}
        </span>
        <span className="block text-[11px] text-gray-400 mt-0.5">
          {prioritesReglees > 0
            ? `Priorité commune : ${prioritesReglees} réglée${prioritesReglees > 1 ? "s" : ""}`
            : "Régler la priorité commune →"}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" /> Groupes surveillés
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={fetchGroups} disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
                  title="Rafraîchir la liste">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3 mb-3">{error}</p>
              )}

              {loading && groups.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Chargement des groupes…</p>
              )}

              {!loading && groups.length === 0 && !error && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">Aucun groupe trouvé.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Le service doit être connecté pour charger les groupes.
                  </p>
                </div>
              )}

              {groups.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 mb-1">
                    {selected.size === 0
                      ? "Aucun groupe sélectionné — tous les groupes seront surveillés."
                      : `${selected.size} groupe${selected.size > 1 ? "s" : ""} sélectionné${selected.size > 1 ? "s" : ""}.`}
                  </p>
                  {communes.length > 0 && (
                    <p className="text-xs text-gray-400 mb-3">
                      La commune choisie à droite départage les noms de quartier présents dans
                      plusieurs villes (« plateau », « centre-ville »). Elle est enregistrée
                      aussitôt, et ne contredit jamais une commune écrite dans l&apos;annonce.
                    </p>
                  )}
                  <div className="space-y-1">
                    {groups.map(g => (
                      <label key={g.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer group">
                        <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors
                          ${selected.has(g.id) ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover:border-blue-400"}`}>
                          {selected.has(g.id) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <input type="checkbox" className="sr-only" checked={selected.has(g.id)}
                          onChange={() => toggle(g.id)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{g.nom}</p>
                          <p className="text-xs text-gray-400 font-mono truncate">{g.id}</p>
                        </div>
                        {g.nb_participants != null && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {g.nb_participants} membre{g.nb_participants > 1 ? "s" : ""}
                          </span>
                        )}
                        {/* Le select est hors du <label> parent : cliqué dedans,
                            il cocherait aussi le groupe. */}
                        {communes.length > 0 && (
                          <select
                            value={g.commune_prioritaire ?? ""}
                            onClick={e => e.preventDefault()}
                            onChange={e => { e.preventDefault(); void changerCommune(g.id, e.target.value) }}
                            title="Commune privilégiée quand un nom de quartier est ambigu"
                            className="flex-shrink-0 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400"
                          >
                            <option value="">Sans priorité</option>
                            {communes.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400">
                Vide = surveille tous les groupes
              </p>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Annuler
                </button>
                <button onClick={save} disabled={saving || saved}
                  className={`px-4 py-2 text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors
                    ${saved ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
                    disabled:opacity-60`}>
                  {saved
                    ? <><Check className="w-3.5 h-3.5" /> Enregistré</>
                    : saving
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sauvegarde…</>
                      : <><Save className="w-3.5 h-3.5" /> Enregistrer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
