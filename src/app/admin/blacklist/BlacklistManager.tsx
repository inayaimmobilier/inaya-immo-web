"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Phone, Mail, Plus, Trash2, ShieldOff, ShieldCheck } from "lucide-react"
import { addBlacklist, toggleBlacklist, removeBlacklist } from "./actions"

export interface BlacklistEntry {
  id: string
  type: "telephone" | "email"
  valeur: string
  motif: string | null
  notes: string | null
  actif: boolean
  user_id: string | null
  created_at: string
}

export default function BlacklistManager({ initialEntries }: { initialEntries: BlacklistEntry[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [type, setType] = useState<"telephone" | "email">("telephone")
  const [valeur, setValeur] = useState("")
  const [motif, setMotif] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const entries = initialEntries

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valeur.trim()) { setError("Saisissez un numéro ou un e-mail."); return }
    startTransition(async () => {
      const r = await addBlacklist({ type, valeur, motif, notes })
      if (!r.ok) { setError(r.error); return }
      setValeur(""); setMotif(""); setNotes("")
      router.refresh()
    })
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => { const r = await fn(); if (!r.ok && r.error) setError(r.error); router.refresh() })

  return (
    <div className="space-y-6">
      {/* Formulaire d'ajout */}
      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setType("telephone")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${type === "telephone" ? "bg-blue-50 border-blue-600 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            <Phone className="w-4 h-4" /> Téléphone
          </button>
          <button type="button" onClick={() => setType("email")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${type === "email" ? "bg-blue-50 border-blue-600 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            <Mail className="w-4 h-4" /> E-mail
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {type === "telephone" ? "Numéro à bloquer" : "Adresse e-mail à bloquer"}
          </label>
          <input value={valeur} onChange={e => setValeur(e.target.value)}
            placeholder={type === "telephone" ? "07 07 84 04 31 ou +225…" : "exemple@mail.com"}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Motif du blocage</label>
          <input value={motif} onChange={e => setMotif(e.target.value)}
            placeholder="Ex : arnaque signalée, faux compte, impayé…"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Détails / notes (facultatif)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Contexte, référence de signalement, etc."
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500 resize-none" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={pending}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> {pending ? "…" : "Ajouter à la liste noire"}
        </button>
      </form>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
          {entries.length} entrée{entries.length > 1 ? "s" : ""}
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune entrée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map(en => (
              <li key={en.id} className="px-5 py-3.5 flex items-start gap-3">
                <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${en.actif ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-400"}`}>
                  {en.type === "telephone" ? <Phone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900 break-all">{en.valeur}</span>
                    {en.user_id && <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">compte banni</span>}
                    {!en.actif && <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">inactif</span>}
                  </div>
                  {en.motif && <p className="text-sm text-gray-600 mt-0.5">{en.motif}</p>}
                  {en.notes && <p className="text-xs text-gray-400 mt-0.5">{en.notes}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{new Date(en.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => act(() => toggleBlacklist(en.id, !en.actif))} disabled={pending}
                    title={en.actif ? "Désactiver" : "Réactiver"}
                    className={`p-2 rounded-lg transition-colors ${en.actif ? "text-gray-400 hover:bg-gray-100" : "text-green-600 hover:bg-green-50"}`}>
                    {en.actif ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { if (confirm("Retirer cette entrée de la liste noire ?")) act(() => removeBlacklist(en.id)) }} disabled={pending}
                    title="Supprimer" className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
