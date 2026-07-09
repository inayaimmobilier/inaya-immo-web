"use client"

import { useState } from "react"
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { updateMyPassword } from "./actions"

export default function PasswordForm() {
  const [pwd, setPwd] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setDone(false)
    if (pwd !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return }
    setLoading(true)
    try {
      const res = await updateMyPassword(pwd)
      if (!res.ok) { setError(res.error); setLoading(false); return }
      setDone(true); setPwd(""); setConfirm(""); setLoading(false)
    } catch {
      setError("Échec de la mise à jour. Réessayez."); setLoading(false)
    }
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-gray-500" /> Changer mon mot de passe
      </h2>
      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}
      {done && (
        <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Mot de passe mis à jour.
        </div>
      )}
      <div className="relative">
        <input value={pwd} onChange={e => setPwd(e.target.value)} type={showPwd ? "text" : "password"}
          autoComplete="new-password" placeholder="Nouveau mot de passe" className={`${field} pr-10`} />
        <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <input value={confirm} onChange={e => setConfirm(e.target.value)} type={showPwd ? "text" : "password"}
        autoComplete="new-password" placeholder="Confirmer le mot de passe" className={field} />
      <button type="submit" disabled={loading || pwd.length < 6}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mise à jour…</> : "Mettre à jour"}
      </button>
    </form>
  )
}
