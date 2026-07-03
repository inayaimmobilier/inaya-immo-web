"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Loader2, UserPlus, Eye, EyeOff } from "lucide-react"
import { createUser } from "./actions"
import type { UserRole } from "@/types/database"

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "proprietaire", label: "Propriétaire" },
  { value: "agent", label: "Agent immobilier" },
  { value: "locataire", label: "Locataire" },
  { value: "prestataire", label: "Prestataire / Technicien" },
  { value: "apporteur", label: "Apporteur d'affaires" },
  { value: "comptable", label: "Comptable / Finance" },
  { value: "moderateur", label: "Modérateur" },
  { value: "admin", label: "Administrateur" },
  { value: "super_admin", label: "Super admin" },
]

export default function CreateUserModal({ canCreateSuperAdmin }: { canCreateSuperAdmin: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<UserRole>("client")
  const [agentType, setAgentType] = useState<"interne" | "externe">("interne")
  const [proprioType, setProprioType] = useState<"diffuseur" | "gere">("diffuseur")
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const roles = ROLE_OPTIONS.filter(r => r.value !== "super_admin" || canCreateSuperAdmin)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr(null)
    start(async () => {
      const res = await createUser({
        nom: String(f.get("nom") || ""),
        prenom: String(f.get("prenom") || "") || undefined,
        telephone: String(f.get("telephone") || "") || undefined,
        email: String(f.get("email") || ""),
        password: String(f.get("password") || ""),
        role,
        agent_type: role === "agent" ? agentType : undefined,
        agence: role === "agent" && agentType === "externe" ? String(f.get("agence") || "") : undefined,
        proprietaire_type: role === "proprietaire" ? proprioType : undefined,
        metier: role === "prestataire" ? String(f.get("metier") || "") : undefined,
      })
      if (!res.ok) { setErr(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
        <UserPlus className="w-4 h-4" /> Créer un utilisateur
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-base font-bold text-gray-900 mb-4">Créer un utilisateur</h2>

            {err && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2 mb-3">{err}</div>}

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type d&apos;utilisateur (rôle)</label>
                <select value={role} onChange={e => setRole(e.target.value as UserRole)} className={field}>
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {role === "agent" && (
                <div className="grid grid-cols-2 gap-2">
                  {([{ v: "interne", t: "Interne" }, { v: "externe", t: "Externe" }] as const).map(o => (
                    <button key={o.v} type="button" onClick={() => setAgentType(o.v)}
                      className={`border-2 rounded-xl py-2 text-sm font-medium transition-colors ${agentType === o.v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
                      {o.t}
                    </button>
                  ))}
                </div>
              )}

              {role === "proprietaire" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type de propriétaire</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([{ v: "diffuseur", t: "Diffuseur", d: "Publie ses propres biens" }, { v: "gere", t: "Géré", d: "Nous gérons ses biens" }] as const).map(o => (
                      <button key={o.v} type="button" onClick={() => setProprioType(o.v)}
                        className={`border-2 rounded-xl px-2 py-2 text-left transition-colors ${proprioType === o.v ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}>
                        <span className={`block text-sm font-medium ${proprioType === o.v ? "text-blue-700" : "text-gray-700"}`}>{o.t}</span>
                        <span className="block text-[11px] text-gray-500">{o.d}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {role === "prestataire" && (
                <input name="metier" placeholder="Métier / spécialité (plomberie, électricité…)" className={field} />
              )}

              <div className="grid grid-cols-2 gap-3">
                <input name="prenom" placeholder="Prénom" className={field} />
                <input name="nom" required placeholder="Nom *" className={field} />
              </div>
              <input name="telephone" type="tel" placeholder="Téléphone (WhatsApp)" className={field} />
              {role === "agent" && agentType === "externe" && (
                <input name="agence" placeholder="Agence / structure (facultatif)" className={field} />
              )}
              <input name="email" type="email" required placeholder="E-mail (connexion) *" className={field} />
              <div className="relative">
                <input name="password" type={showPwd ? "text" : "password"} required minLength={6}
                  placeholder="Mot de passe (6 car. min.) *" className={`${field} pr-10`} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button type="submit" disabled={pending}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Créer le compte
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
