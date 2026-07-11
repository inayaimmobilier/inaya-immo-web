"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bot, Plus, Pencil, Trash2, Loader2, X, Check } from "lucide-react"
import { createAiAgent, updateAiAgent, toggleAiAgent, deleteAiAgent } from "./actions"

export interface AiAgent {
  id: string; nom: string; role: string | null; canaux: string[]
  system_prompt: string | null; base_connaissance: string | null; modele: string | null; actif: boolean
}

const CANAUX = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "site", label: "Site web" },
  { value: "telegram", label: "Telegram" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "E-mail" },
]

const empty: AiAgent = { id: "", nom: "", role: "", canaux: [], system_prompt: "", base_connaissance: "", modele: "", actif: true }
const field = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

export default function AgentsManager({ agents }: { agents: AiAgent[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<AiAgent | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function openNew() { setErr(null); setEditing({ ...empty }) }
  function openEdit(a: AiAgent) { setErr(null); setEditing({ ...a, role: a.role ?? "", system_prompt: a.system_prompt ?? "", base_connaissance: a.base_connaissance ?? "", modele: a.modele ?? "" }) }

  function toggleCanal(c: string) {
    if (!editing) return
    setEditing({ ...editing, canaux: editing.canaux.includes(c) ? editing.canaux.filter(x => x !== c) : [...editing.canaux, c] })
  }

  function save() {
    if (!editing) return
    setErr(null)
    const input = { nom: editing.nom, role: editing.role, canaux: editing.canaux, system_prompt: editing.system_prompt, base_connaissance: editing.base_connaissance, modele: editing.modele }
    start(async () => {
      const res = editing.id ? await updateAiAgent(editing.id, input) : await createAiAgent(input)
      if (!res.ok) { setErr(res.error); return }
      setEditing(null); router.refresh()
    })
  }
  function toggle(a: AiAgent) { start(async () => { await toggleAiAgent(a.id, !a.actif); router.refresh() }) }
  function del(id: string) { start(async () => { const r = await deleteAiAgent(id); if (r.ok) { setConfirmDel(null); router.refresh() } else setErr(r.error) }) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Configurez les agents IA d&apos;Inaya : rôle, canaux, prompt et base de connaissances.</p>
        <button onClick={openNew} className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Nouvel agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucun agent IA configuré.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.actif ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.nom}</p>
                    <p className="text-xs text-gray-400 truncate">{a.role || "—"}</p>
                  </div>
                </div>
                <button onClick={() => toggle(a)} disabled={pending} role="switch" aria-checked={a.actif}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${a.actif ? "bg-green-600" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${a.actif ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {a.canaux.length ? a.canaux.map(c => (
                  <span key={c} className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">{CANAUX.find(x => x.value === c)?.label ?? c}</span>
                )) : <span className="text-[11px] text-gray-400">Aucun canal</span>}
              </div>
              {a.system_prompt && <p className="text-xs text-gray-500 line-clamp-2">{a.system_prompt}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => openEdit(a)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-700">
                  <Pencil className="w-3.5 h-3.5" /> Modifier
                </button>
                {confirmDel === a.id ? (
                  <span className="flex items-center gap-1 ml-auto">
                    <button onClick={() => del(a.id)} disabled={pending} className="text-[11px] bg-red-600 text-white px-2 py-1 rounded-lg">Confirmer</button>
                    <button onClick={() => setConfirmDel(null)} className="text-[11px] text-gray-500">Annuler</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(a.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 ml-auto">
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal création / édition */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-blue-600" /> {editing.id ? "Modifier l'agent" : "Nouvel agent IA"}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3">
              <input value={editing.nom} onChange={e => setEditing({ ...editing, nom: e.target.value })} placeholder="Nom de l'agent *" className={field} />
              <input value={editing.role ?? ""} onChange={e => setEditing({ ...editing, role: e.target.value })} placeholder="Rôle (ex. Assistant commercial)" className={field} />
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Canaux de communication</p>
                <div className="flex flex-wrap gap-2">
                  {CANAUX.map(c => (
                    <button key={c.value} type="button" onClick={() => toggleCanal(c.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editing.canaux.includes(c.value) ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-blue-300"}`}>
                      {editing.canaux.includes(c.value) && <Check className="w-3 h-3 inline mr-1" />}{c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Prompt système</p>
                <textarea value={editing.system_prompt ?? ""} onChange={e => setEditing({ ...editing, system_prompt: e.target.value })} rows={4} placeholder="Instructions de comportement de l'agent…" className={`${field} resize-y`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Base de connaissances</p>
                <textarea value={editing.base_connaissance ?? ""} onChange={e => setEditing({ ...editing, base_connaissance: e.target.value })} rows={3} placeholder="FAQ, règles métier, informations de référence…" className={`${field} resize-y`} />
              </div>
              <input value={editing.modele ?? ""} onChange={e => setEditing({ ...editing, modele: e.target.value })} placeholder="Modèle LLM (optionnel, ex. deepseek-chat)" className={field} />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={save} disabled={pending} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
