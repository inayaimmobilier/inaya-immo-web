"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Loader2, UserPlus, Eye, EyeOff } from "lucide-react"
import { createAgent } from "./actions"

export default function AddAgentModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"interne" | "externe">("interne")
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr(null)
    start(async () => {
      const res = await createAgent({
        nom: String(f.get("nom") || ""),
        telephone: String(f.get("telephone") || ""),
        type,
        agence: String(f.get("agence") || "") || undefined,
        email: String(f.get("email") || "") || null,
        password: String(f.get("password") || "") || null,
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
        <UserPlus className="w-4 h-4" /> Créer un agent
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-base font-bold text-gray-900 mb-1">Créer un agent immobilier</h2>
            <p className="text-xs text-gray-500 mb-4">Interne (salarié Inaya) ou externe (partenaire / autre agence).</p>

            {/* Type d'agent */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([
                { v: "interne", t: "Interne", d: "Travaille chez Inaya" },
                { v: "externe", t: "Externe", d: "Partenaire / indépendant" },
              ] as const).map(o => (
                <button key={o.v} type="button" onClick={() => setType(o.v)}
                  className={`text-left border-2 rounded-xl p-3 transition-colors ${type === o.v ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}>
                  <p className="text-sm font-semibold text-gray-900">{o.t}</p>
                  <p className="text-[11px] text-gray-500">{o.d}</p>
                </button>
              ))}
            </div>

            {err && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2 mb-3">{err}</div>}

            <form onSubmit={onSubmit} className="space-y-3">
              <input name="nom" required placeholder="Nom complet *" className={field} />
              <input name="telephone" type="tel" required placeholder="Téléphone (WhatsApp) *" className={field} />
              {type === "externe" && (
                <input name="agence" placeholder="Agence / structure (facultatif)" className={field} />
              )}
              <input name="email" type="email"
                placeholder={type === "interne" ? "E-mail (connexion) *" : "E-mail (facultatif)"}
                required={type === "interne"} className={field} />
              <div className="relative">
                <input name="password" type={showPwd ? "text" : "password"}
                  placeholder={type === "interne" ? "Mot de passe (6 car. min.) *" : "Mot de passe (facultatif)"}
                  required={type === "interne"} minLength={type === "interne" ? 6 : undefined}
                  className={`${field} pr-10`} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">
                {type === "interne"
                  ? "L'agent interne se connectera au back-office avec ces identifiants."
                  : "Pour un partenaire externe, les identifiants de connexion sont facultatifs (suivi des affaires/commissions uniquement)."}
              </p>
              <button type="submit" disabled={pending}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Créer l&apos;agent
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
