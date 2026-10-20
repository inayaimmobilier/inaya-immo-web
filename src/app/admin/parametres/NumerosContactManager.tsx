"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save, Phone, MessageCircle } from "lucide-react"
import { saveNumerosContact } from "./actions"
import { numeroAffiche, type NumeroContact } from "@/lib/numeros-contact-format"

interface Ligne { numero: string; libelle: string; whatsapp: boolean; actif: boolean }

/**
 * Numéros de contact d'Inaya — affichés en haut de presque toutes les pages
 * du site, au milieu et en bas de l'accueil, et dans l'application mobile.
 * Autant de numéros que voulu ; l'ordre ici est l'ordre d'affichage.
 */
export default function NumerosContactManager({ initial }: { initial: NumeroContact[] }) {
  const [lignes, setLignes] = useState<Ligne[]>(
    initial.map(n => ({ numero: n.numero, libelle: n.libelle ?? "", whatsapp: !!n.whatsapp, actif: n.actif !== false })),
  )
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const maj = (i: number, p: Partial<Ligne>) => setLignes(ls => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const retirer = (i: number) => setLignes(ls => ls.filter((_, j) => j !== i))
  const deplacer = (i: number, d: -1 | 1) => setLignes(ls => {
    const j = i + d
    if (j < 0 || j >= ls.length) return ls
    const n = [...ls];[n[i], n[j]] = [n[j], n[i]]; return n
  })
  const ajouter = () => setLignes(ls => [...ls, { numero: "", libelle: "", whatsapp: true, actif: true }])

  function enregistrer() {
    setMsg(null)
    start(async () => {
      const res = await saveNumerosContact(lignes.filter(l => l.numero.trim()).map(l => ({ ...l, libelle: l.libelle || null })))
      setMsg(res.ok ? { ok: true, text: "Numéros enregistrés — visibles sur le site d'ici quelques instants." } : { ok: false, text: res.error })
    })
  }

  const input = "px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">Numéros de contact d&apos;Inaya</h2>
      </div>
      <p className="text-xs text-gray-500">
        Affichés en haut de presque toutes les pages du site, au milieu et en bas de l&apos;accueil, et dans l&apos;application.
        Sur téléphone, toucher un numéro lance l&apos;appel. L&apos;ordre ci-dessous est l&apos;ordre d&apos;affichage.
      </p>

      <div className="space-y-2">
        {lignes.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-gray-100">
            <input value={l.numero} onChange={e => maj(i, { numero: e.target.value })} inputMode="tel"
              placeholder="07 07 12 34 56" className={`${input} w-40`} />
            <input value={l.libelle} onChange={e => maj(i, { libelle: e.target.value })}
              placeholder="Libellé (ex. Service client)" className={`${input} flex-1 min-w-[160px]`} />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={l.whatsapp} onChange={e => maj(i, { whatsapp: e.target.checked })} />
              <MessageCircle className="w-3.5 h-3.5 text-green-600" /> WhatsApp
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={l.actif} onChange={e => maj(i, { actif: e.target.checked })} /> Affiché
            </label>
            {l.numero.replace(/\D/g, "").length >= 8 && (
              <span className="text-xs text-gray-400">→ {numeroAffiche(l.numero)}</span>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <button type="button" onClick={() => deplacer(i, -1)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Monter"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => deplacer(i, 1)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Descendre"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={() => retirer(i)} className="p-1.5 text-red-400 hover:text-red-600" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {lignes.length === 0 && <p className="text-xs text-gray-400">Aucun numéro : rien ne s&apos;affiche sur le site.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={ajouter}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
          <Plus className="w-4 h-4" /> Ajouter un numéro
        </button>
        <button type="button" onClick={enregistrer} disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
