"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import UserRow, { type UserRowData } from "./UserRow"
import { bulkDeleteUsers } from "./actions"
import type { UserRole } from "@/types/database"

interface Props {
  users: UserRowData[]
  myRole: UserRole
  selfId: string
  botUsername?: string
  /** Active la sélection multiple + suppression groupée (vue « Non vérifiés »). */
  selectionMode: boolean
}

export default function UsersTable({ users, myRole, selfId, botUsername, selectionMode }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  // Comptes sélectionnables (jamais soi-même).
  const selectableIds = useMemo(() => users.filter(u => u.id !== selfId).map(u => u.id), [users, selfId])
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  function runDelete() {
    const ids = [...selected]
    if (!ids.length) return
    setMsg(null)
    start(async () => {
      const res = await bulkDeleteUsers(ids)
      setConfirm(false)
      if (!res.ok) { setMsg(res.error); return }
      setSelected(new Set())
      setMsg(`${res.deleted} compte${res.deleted > 1 ? "s" : ""} supprimé${res.deleted > 1 ? "s" : ""}${res.failed ? ` · ${res.failed} échec(s)` : ""}.`)
      router.refresh()
    })
  }

  const selCount = selected.size

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Barre de suppression groupée */}
      {selectionMode && selectableIds.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-gray-100 bg-gray-50/70">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            {selCount > 0 ? <strong>{selCount} sélectionné{selCount > 1 ? "s" : ""}</strong> : `Tout sélectionner (${selectableIds.length})`}
          </label>

          {selCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              {!confirm ? (
                <button onClick={() => setConfirm(true)} disabled={pending}
                  className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">
                  <Trash2 className="w-4 h-4" /> Supprimer la sélection
                </button>
              ) : (
                <>
                  <span className="text-sm text-red-700 font-medium">Supprimer définitivement {selCount} compte(s) ?</span>
                  <button onClick={runDelete} disabled={pending}
                    className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Oui, supprimer
                  </button>
                  <button onClick={() => setConfirm(false)} disabled={pending}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Annuler</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {msg && <p className="px-5 py-2 text-sm text-green-700 bg-green-50 border-b border-green-100">{msg}</p>}

      {users.length === 0 ? (
        <p className="text-sm text-gray-400 px-5 py-10 text-center">Aucun utilisateur trouvé.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                {selectionMode && <th className="px-3 py-3 w-8"></th>}
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Inscrit</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow key={u.id} user={u} myRole={myRole} isSelf={u.id === selfId} botUsername={botUsername}
                  selectable={selectionMode} checked={selected.has(u.id)} onToggle={toggle} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
