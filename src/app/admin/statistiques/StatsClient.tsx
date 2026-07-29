"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, Search, Trash2, Clock, Pencil, CheckCircle2 } from "lucide-react"
import { deleteSelected, loadDeletions } from "./actions"
import type { TopProperty, SearchTerm, DeletionPoint } from "@/lib/admin-stats"

interface Props {
  vues: TopProperty[]
  recherches: { zones: SearchTerm[]; types: SearchTerm[]; categories: SearchTerm[]; total: number }
  statuts: Record<string, number>
  suppressions: { points: DeletionPoint[]; total: number; disponible: boolean }
  anciennes: TopProperty[]
  defaultFrom: string
  defaultTo: string
  canDelete: boolean
}

const fmtP = (n: number | null) => (n != null && n > 0 ? n.toLocaleString("fr-FR") + " F" : "—")
const fmtD = (s: string) => new Date(s).toLocaleDateString("fr-FR")
const ageJours = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000)

const STATUT_LABEL: Record<string, string> = {
  publie: "Publiées (actives)", en_attente_validation: "En attente", expire: "Expirées",
  suspendu: "Suspendues", rejete: "Rejetées", reserve: "Réservées", conclu: "Conclues",
}
const TYPE_LABEL: Record<string, string> = {
  location: "Location", vente: "Vente", cession: "Cession", residence_meublee: "Résidence meublée",
}

export default function StatsClient(p: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [from, setFrom] = useState(p.defaultFrom)
  const [to, setTo] = useState(p.defaultTo)
  const [sup, setSup] = useState(p.suppressions)

  const toggle = (id: string) => setSel(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function removeSelected() {
    if (sel.size === 0) return
    if (!confirm(`Supprimer définitivement ${sel.size} annonce(s) ? Action irréversible.`)) return
    setBusy(true); setErr(null); setMsg(null)
    const r = await deleteSelected([...sel])
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setMsg(`${r.deleted} annonce(s) supprimée(s).${r.skipped ? ` ${r.skipped} préservée(s) (liées à une transaction).` : ""} Rechargez pour actualiser les listes.`)
    setSel(new Set())
  }

  async function reloadDeletions() {
    setBusy(true); setErr(null)
    const r = await loadDeletions(from, to)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setSup({ points: r.points, total: r.total, disponible: r.disponible })
  }

  const maxPoint = Math.max(1, ...sup.points.map(x => x.count))

  return (
    <div className="space-y-6">
      {/* ── Répartition par statut ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUT_LABEL).map(([k, label]) => (
          <div key={k} className={`rounded-2xl border p-4 ${k === "publie" ? "bg-green-50 border-green-100" : "bg-white border-gray-100"}`}>
            <p className={`text-2xl font-bold ${k === "publie" ? "text-green-700" : "text-gray-900"}`}>{p.statuts[k] ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{err}</div>}
      {msg && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-3">{msg}</div>}

      {/* ── Barre d'action sélection ── */}
      {sel.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-3 bg-blue-700 text-white rounded-xl px-4 py-3 shadow-lg">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium flex-1">{sel.size} annonce(s) sélectionnée(s)</span>
          <button onClick={() => setSel(new Set())} className="text-xs underline">Désélectionner</button>
          {p.canDelete && (
            <button onClick={removeSelected} disabled={busy}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60">
              {busy ? "…" : "Supprimer"}
            </button>
          )}
        </div>
      )}

      {/* ── Annonces les plus consultées ── */}
      <Section icon={<Eye className="w-4 h-4 text-blue-700" />} title="Annonces les plus consultées" hint="30 derniers jours">
        {p.vues.length === 0
          ? <Empty>Aucune vue enregistrée sur la période.</Empty>
          : <PropertyTable rows={p.vues} sel={sel} toggle={toggle} showVues />}
      </Section>

      {/* ── Recherches les plus effectuées ── */}
      <Section icon={<Search className="w-4 h-4 text-blue-700" />} title="Recherches les plus effectuées"
        hint={`${p.recherches.total} recherche(s) · 90 derniers jours`}>
        {p.recherches.total === 0 ? <Empty>Aucune recherche enregistrée.</Empty> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
            <TermList title="Zones les plus demandées" items={p.recherches.zones} />
            <TermList title="Type d'opération" items={p.recherches.types} labels={TYPE_LABEL} />
            <TermList title="Catégories" items={p.recherches.categories} />
          </div>
        )}
      </Section>

      {/* ── Suppressions ── */}
      <Section icon={<Trash2 className="w-4 h-4 text-red-600" />} title="Annonces supprimées" hint="par jour">
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="block text-gray-500 mb-1">Du</span>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </label>
            <label className="text-xs">
              <span className="block text-gray-500 mb-1">Au</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </label>
            <button onClick={reloadDeletions} disabled={busy}
              className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
              {busy ? "…" : "Afficher"}
            </button>
            <span className="text-sm text-gray-600 ml-auto"><b className="text-lg text-gray-900">{sup.total}</b> supprimée(s)</span>
          </div>

          {!sup.disponible ? (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Journal indisponible : appliquez la <b>migration 050</b> dans Supabase. Les suppressions
              faites ensuite seront comptabilisées (celles d&apos;avant ne sont pas récupérables).
            </p>
          ) : sup.points.length === 0 ? (
            <Empty>Aucune suppression sur la période.</Empty>
          ) : (
            <div className="space-y-1.5 pt-1">
              {sup.points.map(pt => (
                <div key={pt.jour} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{fmtD(pt.jour)}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div className="bg-red-500 h-full rounded-full" style={{ width: `${(pt.count / maxPoint) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-8 text-right">{pt.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── Plus anciennes ── */}
      <Section icon={<Clock className="w-4 h-4 text-amber-600" />} title="Annonces les plus anciennes" hint="publiées, à nettoyer en priorité">
        {p.anciennes.length === 0
          ? <Empty>Aucune annonce publiée.</Empty>
          : <PropertyTable rows={p.anciennes} sel={sel} toggle={toggle} showAge />}
      </Section>
    </div>
  )
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        {icon}
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {hint && <span className="text-xs text-gray-400 ml-auto">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 px-4 py-6 text-center">{children}</p>
}

function TermList({ title, items, labels }: { title: string; items: SearchTerm[]; labels?: Record<string, string> }) {
  const max = Math.max(1, ...items.map(i => i.count))
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">{title}</p>
      {items.length === 0 ? <p className="text-xs text-gray-400">—</p> : (
        <div className="space-y-1.5">
          {items.map(i => (
            <div key={i.terme} className="flex items-center gap-2">
              <span className="text-xs text-gray-700 w-28 truncate" title={i.terme}>{labels?.[i.terme] ?? i.terme}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-blue-600 h-full rounded-full" style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-600 w-6 text-right">{i.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PropertyTable({ rows, sel, toggle, showVues, showAge }: {
  rows: TopProperty[]; sel: Set<string>; toggle: (id: string) => void; showVues?: boolean; showAge?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="text-left px-3 py-2 font-medium">Annonce</th>
            <th className="text-left px-3 py-2 font-medium">Prix</th>
            {showVues && <th className="text-right px-3 py-2 font-medium">Vues</th>}
            {showAge && <th className="text-right px-3 py-2 font-medium">Âge</th>}
            <th className="w-16 px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className={`border-t border-gray-50 ${sel.has(r.id) ? "bg-blue-50/60" : "hover:bg-gray-50/60"}`}>
              <td className="px-3 py-2.5">
                <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-700" />
              </td>
              <td className="px-3 py-2.5">
                <p className="text-gray-900 font-medium truncate max-w-xs" title={r.titre}>
                  {r.reference != null && <span className="text-gray-400 font-normal">N°{r.reference} · </span>}{r.titre}
                </p>
                <p className="text-xs text-gray-500">
                  {[r.quartier, r.ville].filter(Boolean).join(", ") || "—"} · {TYPE_LABEL[r.type_offre] ?? r.type_offre} · publiée le {fmtD(r.created_at)}
                </p>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{fmtP(r.prix)}</td>
              {showVues && <td className="px-3 py-2.5 text-right font-semibold text-blue-700">{r.vues}</td>}
              {showAge && <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{ageJours(r.created_at)} j</td>}
              <td className="px-3 py-2.5">
                <Link href={`/admin/annonces/${r.id}`} title="Modifier"
                  className="inline-flex p-1.5 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50">
                  <Pencil className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
