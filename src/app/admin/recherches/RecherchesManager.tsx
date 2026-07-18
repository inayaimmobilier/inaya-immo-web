"use client"

import { useEffect, useState, useTransition } from "react"
import { Plus, Pencil, Trash2, Loader2, X, BellRing, BellOff, CheckCircle2, Search, CheckSquare, Square, Clock, Timer } from "lucide-react"
import {
  createSearchForClient, updateSearchRequest, deleteSearchRequest, setSearchStatus,
  bulkSetSearchStatus, bulkDeleteSearchRequests, saveAlerteProTtl, type SearchInput,
} from "./actions"
import { usePropertyTypes } from "@/hooks/usePropertyTypes"
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
  /** NULL = permanente (client final) ; renseigné = fin de vie (profil pro). */
  expire_at: string | null
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

/** Date + heure de création, format court fr (« 18/07/2026 10:34 »). */
function fmtDateHeure(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

export default function RecherchesManager({ rows, canDelete, isAdmin = false, ttlJours = 30 }: {
  rows: SearchRow[]; canDelete: boolean; isAdmin?: boolean; ttlJours?: number
}) {
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; row: SearchRow }>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [flash, setFlash] = useState<string | null>(null)
  // Sélection multiple (suppression / arrêt / réactivation en masse)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ttl, setTtl] = useState(String(ttlJours))

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

  const toggleSel = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))

  function bulkStatus(statut: RequestStatus, label: string) {
    if (selected.size === 0) return
    if (!confirm(`${label} ${selected.size} recherche(s) sélectionnée(s) ?`)) return
    const ids = [...selected]
    start(async () => {
      const res = await bulkSetSearchStatus(ids, statut)
      setFlash(res.ok ? `${res.count} recherche(s) : ${label.toLowerCase()} ✓` : res.error)
      if (res.ok) setSelected(new Set())
      setTimeout(() => setFlash(null), 6000)
    })
  }
  function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Supprimer DÉFINITIVEMENT ${selected.size} recherche(s) sélectionnée(s) ? Cette action est irréversible.`)) return
    const ids = [...selected]
    start(async () => {
      const res = await bulkDeleteSearchRequests(ids)
      setFlash(res.ok ? `${res.count} recherche(s) supprimée(s).` : res.error)
      if (res.ok) setSelected(new Set())
      setTimeout(() => setFlash(null), 6000)
    })
  }
  function saveTtl() {
    start(async () => {
      const res = await saveAlerteProTtl(Number(ttl))
      setFlash(res.ok
        ? (Number(ttl) === 0
          ? "Durée de vie enregistrée : les alertes des professionnels n'expirent plus automatiquement."
          : `Durée de vie enregistrée : les nouvelles alertes des professionnels expireront après ${Number(ttl)} jour(s).`)
        : res.error)
      setTimeout(() => setFlash(null), 8000)
    })
  }

  return (
    <div className="space-y-4">
      {/* Durée de vie des alertes des professionnels (admins) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
          <Timer className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Durée de vie des alertes des professionnels</p>
            <p className="text-xs text-gray-500">
              Agents (internes/externes), apporteurs, propriétaires, prestataires… : leurs alertes expirent après ce délai.
              Les alertes des <strong>clients finaux restent permanentes</strong> (jusqu&apos;à désactivation par eux ou par vous). 0 = jamais.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input value={ttl} onChange={e => setTtl(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
              className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center outline-none focus:border-blue-400" />
            <span className="text-xs text-gray-500">jours</span>
            <button onClick={saveTtl} disabled={pending}
              className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl disabled:opacity-50">
              Enregistrer
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">{rows.length} recherche{rows.length > 1 ? "s" : ""} enregistrée{rows.length > 1 ? "s" : ""}</p>
        <button onClick={() => setModal({ mode: "create" })}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Créer pour un client
        </button>
      </div>

      {/* Barre d'actions en masse (apparaît dès qu'une ligne est cochée) */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
          <p className="text-sm font-medium text-blue-900">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</p>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <button onClick={() => bulkStatus("expiree", "Arrêter")} disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-medium border border-amber-300 text-amber-700 bg-white px-2.5 py-1.5 rounded-lg hover:bg-amber-50 disabled:opacity-50">
              <BellOff className="w-3.5 h-3.5" /> Arrêter
            </button>
            <button onClick={() => bulkStatus("active", "Réactiver")} disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-medium border border-green-300 text-green-700 bg-white px-2.5 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-50">
              <BellRing className="w-3.5 h-3.5" /> Réactiver
            </button>
            {canDelete && (
              <button onClick={bulkDelete} disabled={pending}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-red-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            )}
            <button onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">
              <X className="w-3.5 h-3.5" /> Annuler
            </button>
          </div>
        </div>
      )}

      {flash && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">{flash}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">Aucune recherche enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                  <th className="px-3 py-3 w-8">
                    <button onClick={toggleAll} title={allSelected ? "Tout désélectionner" : "Tout sélectionner"} className="align-middle">
                      {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-300 hover:text-blue-400" />}
                    </button>
                  </th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Critères</th>
                  <th className="px-4 py-3">Créée</th>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const meta = STATUT_META[r.statut]
                  const busy = pending && pendingId === r.id
                  const isSel = selected.has(r.id)
                  const expired = !!r.expire_at && new Date(r.expire_at).getTime() <= Date.now()
                  return (
                    <tr key={r.id} className={`border-t border-gray-50 ${isSel ? "bg-blue-50/60" : "hover:bg-gray-50/60"}`}>
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSel(r.id)} className="align-middle">
                          {isSel ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-300 hover:text-blue-400" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.contact_nom || "—"}</p>
                        <p className="text-xs text-gray-400 font-mono">{r.contact_telephone || "—"}</p>
                        {r.hasAccount && <span className="text-[10px] text-blue-700 bg-blue-50 rounded-full px-1.5 py-0.5">compte lié</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs">{critLabel(r)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3 text-gray-300" /> {fmtDateHeure(r.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.canal}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.l}</span>
                        {r.expire_at && (
                          <span className={`block mt-1 text-[10px] ${expired ? "text-red-600 font-medium" : "text-gray-400"}`}
                            title="Durée de vie des alertes des professionnels">
                            {expired ? "Expirée" : `expire le ${fmtDateHeure(r.expire_at)}`}
                          </span>
                        )}
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

interface ZoneOpt { id: string; nom: string }

function SearchModal({ initial, onClose, onSaved }: {
  initial: SearchRow | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [tel, setTel] = useState(initial?.contact_telephone ?? "")
  const [nom, setNom] = useState(initial?.contact_nom ?? "")
  const [typeOffre, setTypeOffre] = useState<PropertyType | "">(initial?.type_offre ?? "")
  // Types de biens gérés par l'admin (« Villa », « Entrepôt »… inclus) — même
  // liste que la barre de recherche principale et le formulaire de publication.
  const { options: adminCats } = usePropertyTypes()
  const [cats, setCats] = useState<string[]>(initial?.categories ?? [])
  const [budgetMax, setBudgetMax] = useState(initial?.budget_max ? String(initial.budget_max) : "")
  // Quartiers : sélection comme dans la barre de recherche principale — choisir
  // une commune, puis cocher un ou PLUSIEURS quartiers. Les zones existantes hors
  // référentiel restent affichées (retirable) ; un champ permet d'en ajouter.
  const [zones, setZonesArr] = useState<string[]>(initial?.zones ?? [])
  const [villes, setVilles] = useState<ZoneOpt[]>([])
  const [villeId, setVilleId] = useState("")
  const [quartiers, setQuartiers] = useState<ZoneOpt[]>([])
  const [zoneLibre, setZoneLibre] = useState("")
  const [pieces, setPieces] = useState(initial?.nb_pieces_min ? String(initial.nb_pieces_min) : "")
  const [desc, setDesc] = useState(initial?.description_libre ?? "")
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/zones/villes").then(r => r.json())
      .then((d: ZoneOpt[]) => { if (Array.isArray(d)) setVilles(d) })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!villeId) { setQuartiers([]); return }
    fetch(`/api/zones/quartiers?ville_id=${villeId}`).then(r => r.json())
      .then((d: ZoneOpt[]) => { if (Array.isArray(d)) setQuartiers(d) })
      .catch(() => setQuartiers([]))
  }, [villeId])

  function toggleCat(c: string) {
    setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }
  function toggleZone(nomQuartier: string) {
    setZonesArr(prev => prev.includes(nomQuartier) ? prev.filter(z => z !== nomQuartier) : [...prev, nomQuartier])
  }
  function addZoneLibre() {
    const v = zoneLibre.trim()
    if (v && !zones.includes(v)) setZonesArr(prev => [...prev, v])
    setZoneLibre("")
  }

  function submit() {
    setErr(null)
    const input: SearchInput = {
      contact_telephone: tel,
      contact_nom: nom,
      type_offre: (typeOffre || null) as PropertyType | null,
      categories: cats,
      budget_max: budgetMax ? Number(budgetMax.replace(/\D/g, "")) : null,
      zones,
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
          {/* Types gérés par l'admin (Villa, Entrepôt… inclus) — même liste que la
              recherche principale. Les sous-types sont mappés côté serveur. */}
          <div className="flex flex-wrap gap-1.5">
            {adminCats.map(c => (
              <button key={c.value} type="button" onClick={() => toggleCat(c.value)}
                className={`text-xs px-2.5 py-1 rounded-full border ${cats.includes(c.value) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Localisation : commune → quartiers (sélection multiple), comme la barre
            de recherche principale. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Commune</label>
            <select value={villeId} onChange={e => setVilleId(e.target.value)} className={field}>
              <option value="">Choisir une commune…</option>
              {villes.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pièces min.</label>
            <input value={pieces} onChange={e => setPieces(e.target.value)} inputMode="numeric" placeholder="ex. 2" className={field} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Quartiers <span className="text-gray-400 font-normal">(un ou plusieurs)</span>
          </label>
          {quartiers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 max-h-32 overflow-y-auto">
              {quartiers.map(q => (
                <button key={q.id} type="button" onClick={() => toggleZone(q.nom)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${zones.includes(q.nom) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                  {q.nom}
                </button>
              ))}
            </div>
          )}
          {villeId === "" && quartiers.length === 0 && (
            <p className="text-[11px] text-gray-400 mb-2">Choisissez une commune pour afficher ses quartiers.</p>
          )}
          {/* Quartiers retenus (y compris hors référentiel) — cliquer pour retirer. */}
          {zones.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {zones.map(z => (
                <button key={z} type="button" onClick={() => toggleZone(z)}
                  title="Retirer ce quartier"
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  📍 {z} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={zoneLibre} onChange={e => setZoneLibre(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addZoneLibre() } }}
              placeholder="Autre quartier (hors liste)…" className={field} />
            <button type="button" onClick={addZoneLibre}
              className="shrink-0 text-xs font-medium border border-gray-200 text-gray-600 px-3 rounded-xl hover:border-blue-300">
              Ajouter
            </button>
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
