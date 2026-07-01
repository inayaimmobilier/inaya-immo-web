"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BellPlus, Loader2, Check, MessageCircle } from "lucide-react"
import { saveSearchFull } from "./actions"

const CATEGORIES = [
  { value: "maison",          label: "Maison" },
  { value: "appartement",     label: "Appartement" },
  { value: "studio",          label: "Studio" },
  { value: "terrain",         label: "Terrain" },
  { value: "local_commercial",label: "Local commercial" },
  { value: "bureau",          label: "Bureau" },
  { value: "magasin",         label: "Magasin" },
]

const PIECES_MIN = [
  { value: "", label: "Peu importe" },
  { value: "1", label: "1 pièce minimum" },
  { value: "2", label: "2 pièces minimum" },
  { value: "3", label: "3 pièces minimum" },
  { value: "4", label: "4 pièces minimum" },
  { value: "5", label: "5 pièces ou plus" },
]

interface Initial {
  type: string; categorie: string; quartier: string
  prix_min: string; prix_max: string; pieces_min: string; q: string
}

const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-gray-50 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

export default function NouvelleRequeteForm({
  initial, quartiers, isAuthenticated,
}: {
  initial: Initial
  quartiers: { id: string; nom: string }[]
  isAuthenticated: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState(initial)
  const [telephone, setTelephone] = useState("")
  const [nom, setNom] = useState("")
  const set = (k: keyof Initial, v: string) => setForm(p => ({ ...p, [k]: v }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Sans compte : le numéro WhatsApp est requis pour le recontact.
    if (!isAuthenticated) {
      const digits = telephone.replace(/\D/g, "")
      if (digits.length < 8) { setError("Entrez un numéro WhatsApp valide pour être alerté(e)."); return }
    }
    start(async () => {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (!isAuthenticated) {
        fd.append("telephone", telephone.replace(/[^\d+]/g, ""))
        fd.append("nom", nom)
      }
      const res = await saveSearchFull(fd)
      if ("error" in res) { setError(res.error ?? null); return }
      setDone(true)
      setTimeout(() => router.push(isAuthenticated ? "/client/mes-requetes" : "/biens"), 1800)
    })
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <p className="font-semibold text-gray-900 mb-1">Recherche enregistrée !</p>
        <p className="text-sm text-gray-500">Vous serez alerté(e) dès qu&apos;un bien correspond.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Type offre */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Type de recherche</label>
        <div className="flex gap-2">
          {[["", "Location & Vente"], ["location", "Location"], ["vente", "Vente"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => set("type", v)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                form.type === v
                  ? "bg-blue-700 text-white border-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-blue-300 bg-white"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Catégorie */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Type de bien</label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => set("categorie", "")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              form.categorie === "" ? "bg-blue-700 text-white border-blue-700" : "border-gray-200 text-gray-600 hover:border-blue-200 bg-white"
            }`}>
            Tous
          </button>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => set("categorie", c.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                form.categorie === c.value ? "bg-blue-700 text-white border-blue-700" : "border-gray-200 text-gray-600 hover:border-blue-200 bg-white"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quartier */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Quartier</label>
        <select value={form.quartier} onChange={e => set("quartier", e.target.value)} className={inputCls}>
          <option value="">Tous les quartiers</option>
          {quartiers.map(q => <option key={q.id} value={q.nom}>{q.nom}</option>)}
        </select>
      </div>

      {/* Pièces min */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre de pièces minimum</label>
        <select value={form.pieces_min} onChange={e => set("pieces_min", e.target.value)} className={inputCls}>
          {PIECES_MIN.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Budget */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Budget (FCFA)</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <input type="number" min={0} placeholder="Min (optionnel)"
              value={form.prix_min} onChange={e => set("prix_min", e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <input type="number" min={0} placeholder="Max (optionnel)"
              value={form.prix_max} onChange={e => set("prix_max", e.target.value)}
              className={inputCls} />
          </div>
        </div>
      </div>

      {/* Description libre */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Précisions <span className="text-gray-400 font-normal">(optionnel)</span>
        </label>
        <textarea value={form.q} onChange={e => set("q", e.target.value)}
          rows={2} placeholder="Ex : villa avec jardin, proche du marché…"
          className={`${inputCls} resize-none`} />
      </div>

      {/* Numéro WhatsApp — requis sans compte, pour le recontact */}
      {!isAuthenticated && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-600" />
            <p className="text-xs text-gray-600">
              Pas de compte ? Laissez votre <strong>numéro WhatsApp</strong> : nous vous alertons dès qu&apos;un bien correspond.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Numéro WhatsApp <span className="text-red-500">*</span></label>
            <input type="tel" inputMode="tel" value={telephone} onChange={e => setTelephone(e.target.value)}
              placeholder="Ex : 07 07 00 00 00" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Votre nom <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Ex : Awa K." className={inputCls} />
          </div>
        </div>
      )}

      <button type="submit" disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellPlus className="w-4 h-4" />}
        {pending ? "Enregistrement…" : "Activer les alertes"}
      </button>
    </form>
  )
}
