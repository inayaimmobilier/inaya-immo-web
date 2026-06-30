"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Loader2, Pencil } from "lucide-react"
import { updateAgent } from "../actions"

interface Props {
  agentId: string
  initial: {
    nom: string; prenom: string | null; telephone: string | null
    agent_type: string | null; agence: string | null
  }
}

export default function EditAgentModal({ agentId, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"interne" | "externe">(
    initial.agent_type === "externe" ? "externe" : "interne"
  )
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr(null)
    start(async () => {
      const res = await updateAgent(agentId, {
        nom: String(f.get("nom") || ""),
        prenom: String(f.get("prenom") || "") || undefined,
        telephone: String(f.get("telephone") || "") || undefined,
        agent_type: type,
        agence: type === "externe" ? String(f.get("agence") || "") : undefined,
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
        className="inline-flex items-center gap-1.5 text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-xl">
        <Pencil className="w-4 h-4" /> Modifier
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-base font-bold text-gray-900 mb-4">Modifier l&apos;agent</h2>

            {err && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2 mb-3">{err}</div>}

            <form onSubmit={onSubmit} className="space-y-3">
              {/* Type d'agent */}
              <div className="grid grid-cols-2 gap-2">
                {([{ v: "interne", t: "Interne", d: "Travaille chez Inaya" }, { v: "externe", t: "Externe", d: "Partenaire / indépendant" }] as const).map(o => (
                  <button key={o.v} type="button" onClick={() => setType(o.v)}
                    className={`text-left border-2 rounded-xl p-3 transition-colors ${type === o.v ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}>
                    <p className="text-sm font-semibold text-gray-900">{o.t}</p>
                    <p className="text-[11px] text-gray-500">{o.d}</p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input name="prenom" defaultValue={initial.prenom ?? ""} placeholder="Prénom" className={field} />
                <input name="nom" required defaultValue={initial.nom} placeholder="Nom *" className={field} />
              </div>
              <input name="telephone" type="tel" defaultValue={initial.telephone ?? ""} placeholder="Téléphone (WhatsApp)" className={field} />
              {type === "externe" && (
                <input name="agence" defaultValue={initial.agence ?? ""} placeholder="Agence / structure (facultatif)" className={field} />
              )}

              <button type="submit" disabled={pending}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Enregistrer
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
