"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Check, Settings2 } from "lucide-react"
import { updateUserRole, updateUserStatus } from "./actions"
import { ROLE_LABEL, ROLE_COLOR, USER_STATUS_LABEL, USER_STATUS_COLOR, formatRelativeDate } from "@/lib/utils"
import type { UserRole, UserStatus } from "@/types/database"

export interface UserRowData {
  id: string
  nom: string | null
  prenom: string | null
  email: string | null
  telephone: string | null
  telegram_chat_id: string | null
  role: UserRole
  status: UserStatus
  verifie: boolean
  created_at: string
}

interface Props {
  user: UserRowData
  /** Rôle de l'utilisateur connecté, pour activer/désactiver les contrôles. */
  myRole: UserRole
  /** true si la ligne correspond à l'utilisateur connecté. */
  isSelf: boolean
  /** Username du bot Telegram (sans @) pour générer le deep link. */
  botUsername?: string
  /** Affiche une case à cocher de sélection (pour la suppression groupée). */
  selectable?: boolean
  checked?: boolean
  onToggle?: (id: string) => void
}

const ROLES: UserRole[] = ["client", "proprietaire", "locataire", "prestataire", "apporteur", "agent", "comptable", "moderateur", "admin", "super_admin"]
const STATUSES: UserStatus[] = ["actif", "suspendu", "banni"]

const STAFF_ROLES: UserRole[] = ["agent", "moderateur", "admin", "super_admin"]

export default function UserRow({ user, myRole, isSelf, botUsername, selectable, checked, onToggle }: Props) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [status, setStatus] = useState<UserStatus>(user.status)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const canEdit = (myRole === "super_admin" || myRole === "admin") && !isSelf
  // Un admin (non super) ne peut pas toucher un super_admin ni promouvoir vers super_admin
  const lockedBySuperAdmin = myRole !== "super_admin" && user.role === "super_admin"

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function onRole(next: UserRole) {
    const prev = role
    setRole(next); setError(null)
    startTransition(async () => {
      const res = await updateUserRole(user.id, next)
      if (!res.ok) { setRole(prev); setError(res.error) } else flashSaved()
    })
  }

  function onStatus(next: UserStatus) {
    const prev = status
    setStatus(next); setError(null)
    startTransition(async () => {
      const res = await updateUserStatus(user.id, next)
      if (!res.ok) { setStatus(prev); setError(res.error) } else flashSaved()
    })
  }

  const nomComplet = `${user.prenom || ""} ${user.nom || ""}`.trim() || "—"
  const roleOptions = myRole === "super_admin" ? ROLES : ROLES.filter(r => r !== "super_admin")

  return (
    <tr className={`border-t border-gray-50 transition-colors ${checked ? "bg-blue-50/50" : "hover:bg-gray-50/60"}`}>
      {/* Case de sélection */}
      {selectable && (
        <td className="px-3 py-3 w-8">
          {!isSelf && (
            <input type="checkbox" checked={!!checked} onChange={() => onToggle?.(user.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          )}
        </td>
      )}

      {/* Identité */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {nomComplet}
              {isSelf && <span className="ml-1.5 text-xs text-blue-600 font-normal">(vous)</span>}
              {!user.verifie && !isSelf && (
                <span className="ml-1.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full align-middle">Non vérifié</span>
              )}
            </p>
            <p className="text-xs text-gray-400">{user.email || "—"}</p>
          </div>
        </div>
      </td>

      {/* Téléphone + Telegram */}
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
        <div className="space-y-1">
          <div>{user.telephone || "—"}</div>
          {STAFF_ROLES.includes(user.role) && (
            user.telegram_chat_id
              ? <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full">✈ TG connecté</span>
              : botUsername
                ? <a href={`https://t.me/${botUsername}?start=${user.id}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-sky-600 underline underline-offset-2">
                    Connecter Telegram ↗
                  </a>
                : null
          )}
        </div>
      </td>

      {/* Rôle */}
      <td className="px-4 py-3">
        {canEdit && !lockedBySuperAdmin ? (
          <select
            value={role}
            disabled={pending}
            onChange={(e) => onRole(e.target.value as UserRole)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
          >
            {roleOptions.map(r => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        ) : (
          <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[role]}`}>
            {ROLE_LABEL[role]}
          </span>
        )}
      </td>

      {/* Statut */}
      <td className="px-4 py-3">
        {canEdit && !lockedBySuperAdmin ? (
          <select
            value={status}
            disabled={pending}
            onChange={(e) => onStatus(e.target.value as UserStatus)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{USER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        ) : (
          <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${USER_STATUS_COLOR[status]}`}>
            {USER_STATUS_LABEL[status]}
          </span>
        )}
      </td>

      {/* Inscrit */}
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
        {formatRelativeDate(user.created_at)}
      </td>

      {/* État de l'action + gérer */}
      <td className="px-4 py-3 w-24">
        <div className="flex items-center justify-end gap-2">
          {pending && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          {!pending && saved && <Check className="w-4 h-4 text-green-500" />}
          {!pending && error && (
            <span title={error} className="text-xs text-red-500 cursor-help">⚠</span>
          )}
          <Link href={`/admin/utilisateurs/${user.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-lg px-2 py-1"
            title="Gérer l'utilisateur et ses données">
            <Settings2 className="w-3.5 h-3.5" /> Gérer
          </Link>
        </div>
      </td>
    </tr>
  )
}
