"use client"

import { useState, useTransition } from "react"
import { Plus, Pencil, Trash2, Loader2, X, BellRing, BellOff, CheckCircle2, Search } from "lucide-react"
import { createSearchForClient, updateSearchRequest, deleteSearchRequest, setSearchStatus, type SearchInput } from "./actions"
import type { PropertyType, PropertyCat, RequestStatus } from "@/types/database"

export interface SearchRow {
  id: string
  contact_nom: string | null
  contact_telephone: string | null
  canal: string
  type_offre: PropertyType | null
  categories: PropertyCat[] | null
  budget_min: number | null
  budget_max: number | null
  zones: string[] | null
  nb_pieces_min: number | null
  meuble: boolean | null
  description_libre: string | null
  statut: RequestStatus
  created_at: string
  hasAccount: boolean
}

const TYPES: { v: PropertyType; l: string }[] = [
  { v: "location", l: "Location" }, { v: "vente", l: "Vente" },
  { v: "cession", l: "Cession" }, { v: "residence_meublee", l: "Résidence meublée" },
]
const CATS: { v: PropertyCat; l: string }[] = [
  { v: "maison", l: "Maison" }, { v: "appartement", l: "Appartement" }, { v: "studio", l: "Studio" },
  { v: "terrain", l: "Terrain" }, { v: "local_commercial", l: "Local commercial" },
  { v: "bureau", l: "Bureau" }, { v: "magasin", l: "Magasin" }, { v: "autre", l: "Autre" },
]
const STATUT_META: Record<RequestStatus, { l: string; cls: string }> = {
  active: { l: "Active", cls: "bg-green-50 text-green-700" },
  satisfaite: { l: "Satisfaite", cls: "bg-blue-50 text-blue-700" },
  expiree: { l: "Arrêtée", cls: "bg-gray-100 text-gray-500" },
}
const fmt = (n: number) => n.toLocaleString("fr-FR")

function critLabel(r: SearchRow): string {
  const parts: string[] = []
  if (r.type_offre) parts.push(TYPES.find(t => t.v === r.type_offre)?.l ?? r.type_offre)
  if (r.categories?.length) parts.push(r.categories.map(c => CATS.find(x => x.v === c)?.l ?? c).join(", "))
  if (r.zones?.length) parts.push(`📍 ${r.zones.join(", ")}`)
  if (r.budget_max) parts.push(`≤ ${fmt(r.budget_max)} F`)
  else if (r.budget_min) parts.push(`≥ ${fmt(r.budget_min)} F`)
  if (r.nb_pieces_min) parts.push(`${r.nb_pieces_min}+ pièces`)
  return parts.join(" · ") || r.description_libre || "—"
}

const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

export default function RecherchesManager({ rows, canDelete }: { rows: SearchRow[]; canDelete: boolean }) {
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; row: SearchRow }>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [flash, setFlash] = useState<string | null>(null)

  function onStatus(r: SearchRow, statut: RequestStatus) {
    setPendingId(r.id)
    start(async () => {
      await setSearchStatus(r.id, statut)
      setPendingId(null)
    })
  }
  function onDelete(r: SearchRow) {
    if (!confirm(`Supprimer définitivement la recherche de ${r.contact_nom || r.contact_telephone || "ce client"} ?`)) return
    setPendingId(r.id)
    start(async () => {
      await deleteSearchRequest(r.id)
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">{rows.length} recherche{rows.length > 1 ? "s" : ""} enregistrée{rows.length > 1 ? "s" : ""}</p>
        <button onClick={() => setModal({ mode: "create" })}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Créer pour un client
        </button>
      </div>

      {flash && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">{flash}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">Aucune recherche enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Critères</th>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const meta = STATUT_META[r.statut]
                  const busy = pending && pendingId === r.id
                  return (
                    <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.contact_nom || "—"}</p>
                        <p className="text-xs text-gray-400 font-mono">{r.contact_telephone || "—"}</p>
                        {r.hasAccount && <span className="text-[10px] text-blue-700 bg-blue-50 rounded-full px-1.5 py-0.5">compte lié</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs">{critLabel(r)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.canal}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.l}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                          {r.statut === "active" ? (
                            <button onClick={() => onStatus(r, "expiree")} disabled={busy} title="Arrêter l'alerte"
                              className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg"><BellOff className="w-4 h-4" /></button>
                          ) : (
                            <button onClick={() => onStatus(r, "active")} disabled={busy} title="Réactiver l'alerte"
                              className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg"><BellRing className="w-4 h-4" /></button>
                          )}
                          {r.statut !== "satisfaite" && (
                            <button onClick={() => onStatus(r, "satisfaite")} disabled={busy} title="Marquer satisfaite"
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><CheckCircle2 className="w-4 h-4" /></button>
                          )}
                          <button onClick={() => setModal({ mode: "edit", row: r })} disabled={busy} title="Modifier"
                            className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg"><Pencil className="w-4 h-4" /></button>
                          {canDelete && (
                            <button onClick={() => onDelete(r)} disabled={busy} title="Supprimer"
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <SearchModal
          initial={modal.mode === "edit" ? modal.row : null}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); setFlash(msg); setTimeout(() => setFlash(null), 6000) }}
        />
      )}
    </div>
  )
}

function SearchModal({ initial, onClose, onSaved }: {
  initial: SearchRow | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [tel, setTel] = useState(initial?.contact_telephone ?? "")
  const [nom, setNom] = useState(initial?.contact_nom ?? "")
  const [typeOffre, setTypeOffre] = useState<PropertyType | "">(initial?.type_offre ?? "")
  const [cats, setCats] = useState<PropertyCat[]>(initial?.categories ?? [])
  const [budgetMax, setBudgetMax] = useState(initial?.budget_max ? String(initial.budget_max) : "")
  const [zones, setZones] = useState((initial?.zones ?? []).join(", "))
  const [pieces, setPieces] = useState(initial?.nb_pieces_min ? String(initial.nb_pieces_min) : "")
  const [desc, setDesc] = useState(initial?.description_libre ?? "")
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function toggleCat(c: PropertyCat) {
    setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  function submit() {
    setErr(null)
    const input: SearchInput = {
      contact_telephone: tel,
      contact_nom: nom,
      type_offre: (typeOffre || null) as PropertyType | null,
      categories: cats,
      budget_max: budgetMax ? Number(budgetMax.replace(/\D/g, "")) : null,
      zones: zones.split(",").map(s => s.trim()).filter(Boolean),
      nb_pieces_min: pieces ? Number(pieces) : null,
      description_libre: desc,
    }
    start(async () => {
      const res = initial
        ? await updateSearchRequest(initial.id, input)
        : await createSearchForClient(input)
      if (!res.ok) { setErr(res.error); return }
      const m = !initial && res.matched
        ? `Recherche créée. ${res.matched} bien${res.matched > 1 ? "s" : ""} déjà en ligne — le client est alerté.`
        : initial ? "Recherche mise à jour." : "Recherche créée. Le client sera alerté dès qu'un bien correspondra."
      onSaved(m)
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-600" /> {initial ? "Modifier la recherche" : "Créer une recherche pour un client"}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone du client *</label>
            <input value={tel} onChange={e => setTel(e.target.value)} type="tel" placeholder="+225 07…" className={field} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nom du client</label>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom complet" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={typeOffre} onChange={e => setTypeOffre(e.target.value as PropertyType | "")} className={field}>
              <option value="">Tous</option>
              {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Budget max (FCFA)</label>
            <input value={budgetMax} onChange={e => setBudgetMax(e.target.value)} inputMode="numeric" placeholder="ex. 100000" className={field} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Catégories</label>
          <div className="flex flex-wrap gap-1.5">
            {CATS.map(c => (
              <button key={c.v} type="button" onClick={() => toggleCat(c.v)}
                className={`text-xs px-2.5 py-1 rounded-full border ${cats.includes(c.v) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                {c.l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quartiers (séparés par des virgules)</label>
            <input value={zones} onChange={e => setZones(e.target.value)} placeholder="Nimbo, Koko…" className={field} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pièces min.</label>
            <input value={pieces} onChange={e => setPieces(e.target.value)} inputMode="numeric" placeholder="ex. 2" className={field} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Précisions (optionnel)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Ex. proche du campus, meublé…" className={`${field} resize-none`} />
        </div>

        <button onClick={submit} disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl disabled:opacity-60">
          {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          {initial ? "Enregistrer" : "Créer la recherche"}
        </button>
      </div>
    </div>
  )
}
