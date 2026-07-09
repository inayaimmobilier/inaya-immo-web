"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Trash2, ShieldCheck, ShieldAlert, KeyRound, Eye, EyeOff, RefreshCw, Copy } from "lucide-react"
import { updateUserProfile, deleteUser, updateUserRole, updateUserStatus, setUserPassword } from "../actions"
import { ROLE_LABEL, USER_STATUS_LABEL } from "@/lib/utils"
import type { UserRole, UserStatus } from "@/types/database"

export interface ManageUser {
  id: string
  nom: string
  prenom: string
  telephone: string
  commune: string
  email: string
  role: UserRole
  status: UserStatus
  verifie: boolean
}

interface Props {
  user: ManageUser
  roleOptions: UserRole[]
  canManageRole: boolean
  isSelf: boolean
}

const STATUSES: UserStatus[] = ["actif", "suspendu", "banni"]
const input = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

export default function UserManage({ user, roleOptions, canManageRole, isSelf }: Props) {
  const router = useRouter()
  const [nom, setNom] = useState(user.nom)
  const [prenom, setPrenom] = useState(user.prenom)
  const [telephone, setTelephone] = useState(user.telephone)
  const [commune, setCommune] = useState(user.commune)
  const [email, setEmail] = useState(user.email)
  const [role, setRole] = useState<UserRole>(user.role)
  const [status, setStatus] = useState<UserStatus>(user.status)

  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Mot de passe (réinitialisation admin — le mot de passe actuel n'est jamais lisible).
  const [newPwd, setNewPwd] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [pwdSet, setPwdSet] = useState<string | null>(null)

  const isSynthEmail = email.endsWith("@auto.inaya-immo.ci")

  function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      const res = await updateUserProfile(user.id, {
        nom, prenom, telephone, commune,
        // On n'envoie l'e-mail que s'il est réel et modifié (jamais l'adresse synthétique).
        email: !isSynthEmail && email !== user.email ? email : undefined,
      })
      setMsg(res.ok ? { ok: true, text: "Modifications enregistrées." } : { ok: false, text: res.error })
      if (res.ok) router.refresh()
    })
  }

  function onRole(next: UserRole) {
    const prev = role; setRole(next); setMsg(null)
    start(async () => {
      const res = await updateUserRole(user.id, next)
      if (!res.ok) { setRole(prev); setMsg({ ok: false, text: res.error }) }
      else { setMsg({ ok: true, text: "Rôle mis à jour." }); router.refresh() }
    })
  }
  function onStatus(next: UserStatus) {
    const prev = status; setStatus(next); setMsg(null)
    start(async () => {
      const res = await updateUserStatus(user.id, next)
      if (!res.ok) { setStatus(prev); setMsg({ ok: false, text: res.error }) }
      else { setMsg({ ok: true, text: "Statut mis à jour." }); router.refresh() }
    })
  }

  function generatePwd() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    let out = ""
    const rnd = new Uint32Array(10)
    crypto.getRandomValues(rnd)
    for (let i = 0; i < 10; i++) out += chars[rnd[i] % chars.length]
    setNewPwd(out); setShowPwd(true)
  }

  function savePwd() {
    if (newPwd.length < 6) { setMsg({ ok: false, text: "Le mot de passe doit comporter au moins 6 caractères." }); return }
    setMsg(null); setPwdSet(null)
    start(async () => {
      const res = await setUserPassword(user.id, newPwd)
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return }
      setPwdSet(newPwd)     // affiché une fois pour communication à l'utilisateur
      setNewPwd("")
      setMsg({ ok: true, text: "Nouveau mot de passe défini." })
    })
  }

  function doDelete() {
    setDeleting(true); setMsg(null)
    start(async () => {
      const res = await deleteUser(user.id)
      if (!res.ok) { setDeleting(false); setMsg({ ok: false, text: res.error }); return }
      // Auto-suppression : la session vient d'être détruite, direction l'accueil.
      window.location.href = isSelf ? "/" : "/admin/utilisateurs"
    })
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`text-sm rounded-xl px-4 py-3 border ${msg.ok ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Identité */}
      <form onSubmit={save} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Informations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Nom</label>
            <input value={nom} onChange={e => setNom(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Prénom</label>
            <input value={prenom} onChange={e => setPrenom(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Téléphone</label>
            <input value={telephone} onChange={e => setTelephone(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Commune</label>
            <input value={commune} onChange={e => setCommune(e.target.value)} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">E-mail</label>
            <input value={isSynthEmail ? "" : email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder={isSynthEmail ? "Aucun e-mail réel (compte par téléphone)" : ""} className={input} />
          </div>
        </div>
        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
        </button>
      </form>

      {/* Rôle & statut */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Rôle & accès</h2>
        <div className="flex items-center gap-2 text-xs">
          {user.verifie
            ? <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-full"><ShieldCheck className="w-3.5 h-3.5" /> Compte vérifié</span>
            : <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-full"><ShieldAlert className="w-3.5 h-3.5" /> Non vérifié</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Rôle</label>
            <select value={role} disabled={!canManageRole || pending} onChange={e => onRole(e.target.value as UserRole)}
              className={`${input} disabled:opacity-60`}>
              {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Statut</label>
            <select value={status} disabled={!canManageRole || pending} onChange={e => onStatus(e.target.value as UserStatus)}
              className={`${input} disabled:opacity-60`}>
              {STATUSES.map(s => <option key={s} value={s}>{USER_STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        </div>
        {isSelf && role === "super_admin" && (
          <p className="text-xs text-gray-400">
            Vous gérez votre propre compte. Impossible de vous retirer le rôle super admin ou de vous suspendre si vous êtes le dernier super admin actif.
          </p>
        )}
      </div>

      {/* Mot de passe */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-500" /> Mot de passe
        </h2>
        <p className="text-xs text-gray-500">
          Le mot de passe actuel n&apos;est pas affichable : il est chiffré (haché) et ne peut pas être récupéré,
          même par un administrateur. Vous pouvez en définir un nouveau et le communiquer à l&apos;utilisateur.
        </p>

        {pwdSet && (
          <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
            <p className="text-xs text-green-700 mb-1">Nouveau mot de passe défini — communiquez-le maintenant, il ne sera plus affiché :</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-semibold text-gray-900 bg-white border border-green-200 rounded-lg px-3 py-1.5">{pwdSet}</code>
              <button type="button" onClick={() => navigator.clipboard?.writeText(pwdSet)}
                className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900">
                <Copy className="w-3.5 h-3.5" /> Copier
              </button>
            </div>
          </div>
        )}

        <div className="flex items-stretch gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type={showPwd ? "text" : "password"}
              autoComplete="new-password" placeholder="Nouveau mot de passe" className={`${input} pr-10`} />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button type="button" onClick={generatePwd}
            className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700 px-3 rounded-xl text-sm font-medium">
            <RefreshCw className="w-4 h-4" /> Générer
          </button>
          <button type="button" onClick={savePwd} disabled={pending || newPwd.length < 6}
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-60">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Définir
          </button>
        </div>
      </div>

      {/* Zone de danger */}
      <div className="bg-red-50/60 rounded-2xl border border-red-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-red-700">Zone de danger</h2>
        <p className="text-xs text-red-600">
          {isSelf
            ? "Supprimer VOTRE PROPRE compte efface définitivement vos données et vous déconnecte immédiatement. Action irréversible."
            : "Supprimer ce compte efface définitivement l'utilisateur et ses données rattachées. Action irréversible."}
        </p>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)}
            className="inline-flex items-center gap-2 bg-white border border-red-300 text-red-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> {isSelf ? "Supprimer mon compte" : "Supprimer ce compte"}
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-700 font-medium">
              {isSelf ? "Confirmer la suppression de VOTRE compte ? Vous serez déconnecté." : "Confirmer la suppression définitive ?"}
            </span>
            <button onClick={doDelete} disabled={deleting}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Oui, supprimer
            </button>
            <button onClick={() => setConfirmDel(false)} disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Annuler</button>
          </div>
        )}
      </div>
    </div>
  )
}
