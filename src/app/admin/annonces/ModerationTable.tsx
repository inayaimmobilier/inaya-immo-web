"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, CheckCircle, XCircle, Flag, Loader2, CheckCheck } from "lucide-react"
import { formatPrix, formatRelativeDate, TYPE_OFFRE_LABEL } from "@/lib/utils"
import { bulkModerate } from "./actions"

export interface AnnonceRow {
  id: string; titre: string; type_offre: string; categorie: string; statut: string
  prix: number | null; quartier: string | null; source: string | null; created_at: string
  thumb: string | null; reported: number
}

const STATUT_PILL: Record<string, string> = {
  publie: "bg-green-50 text-green-700 border-green-100",
  en_attente_validation: "bg-amber-50 text-amber-700 border-amber-100",
  rejete: "bg-red-50 text-red-700 border-red-100",
  suspendu: "bg-gray-100 text-gray-500 border-gray-200",
  brouillon: "bg-gray-50 text-gray-400 border-gray-100",
  reserve: "bg-indigo-50 text-indigo-700 border-indigo-100",
  conclu: "bg-purple-50 text-purple-700 border-purple-100",
}

export default function ModerationTable({ rows }: { rows: AnnonceRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const pendingIds = useMemo(() => rows.filter(r => r.statut === "en_attente_validation").map(r => r.id), [rows])
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every(id => selected.has(id))

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allPendingSelected ? new Set() : new Set(pendingIds))
  }

  function run(ids: string[], statut: "publie" | "rejete", confirmLabel?: string) {
    if (!ids.length) return
    if (confirmLabel && !confirm(confirmLabel)) return
    setMsg(null)
    if (ids.length === 1) setBusyId(ids[0])
    start(async () => {
      const res = await bulkModerate(ids, statut)
      setBusyId(null)
      if (!res.ok) { setMsg(res.error); return }
      setSelected(new Set())
      setMsg(`${res.count} annonce${res.count > 1 ? "s" : ""} ${statut === "publie" ? "publiée(s)" : "rejetée(s)"}.`)
      router.refresh()
    })
  }

  const selCount = selected.size

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Barre d'actions groupées — visible s'il y a des annonces en attente */}
      {pendingIds.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-gray-100 bg-gray-50/70">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allPendingSelected} onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            {selCount > 0 ? <strong>{selCount} sélectionnée{selCount > 1 ? "s" : ""}</strong> : `Tout sélectionner (${pendingIds.length} en attente)`}
          </label>

          {selCount > 0 ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => run([...selected], "publie")} disabled={pending}
                className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Publier la sélection
              </button>
              <button onClick={() => run([...selected], "rejete", `Rejeter ${selCount} annonce(s) ?`)} disabled={pending}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">
                <XCircle className="w-4 h-4" /> Rejeter la sélection
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => run(pendingIds, "publie", `Publier TOUTES les ${pendingIds.length} annonces en attente ?`)} disabled={pending}
                className="inline-flex items-center gap-1.5 border border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Tout publier
              </button>
              <button onClick={() => run(pendingIds, "rejete", `Rejeter TOUTES les ${pendingIds.length} annonces en attente ?`)} disabled={pending}
                className="inline-flex items-center gap-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">
                <XCircle className="w-4 h-4" /> Tout rejeter
              </button>
            </div>
          )}
        </div>
      )}
      {msg && <p className="px-5 py-2 text-sm text-green-700 bg-green-50 border-b border-green-100">{msg}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="w-8 px-3 py-3"></th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Annonce</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Prix</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(p => {
              const isPending = p.statut === "en_attente_validation"
              const isChecked = selected.has(p.id)
              return (
                <tr key={p.id} className={`transition-colors ${p.reported > 0 ? "bg-red-50/70 border-l-4 border-l-red-500" : isChecked ? "bg-blue-50/50" : "hover:bg-gray-50/60"}`}>
                  <td className="px-3 py-3 align-top">
                    {isPending && (
                      <input type="checkbox" checked={isChecked} onChange={() => toggle(p.id)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/annonces/${p.id}`} className="flex items-center gap-3 group">
                      {p.thumb
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.thumb} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className={`font-medium truncate max-w-[200px] ${p.reported > 0 ? "text-red-700" : "text-gray-900 group-hover:text-blue-700"}`}>{p.titre}</p>
                        {p.reported > 0
                          ? <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full"><Flag className="w-3 h-3" /> {p.reported} signalement{p.reported > 1 ? "s" : ""}</span>
                          : <p className="text-xs text-gray-400">{p.quartier}</p>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.type_offre === "location" ? "bg-blue-50 text-blue-700"
                      : p.type_offre === "residence_meublee" ? "bg-teal-50 text-teal-700"
                      : p.type_offre === "cession" ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"
                    }`}>{TYPE_OFFRE_LABEL[p.type_offre] ?? p.type_offre}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 hidden lg:table-cell whitespace-nowrap">
                    {p.prix ? formatPrix(p.prix) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUT_PILL[p.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {p.statut.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell whitespace-nowrap">{formatRelativeDate(p.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending && (
                        <>
                          <button onClick={() => run([p.id], "publie")} disabled={pending}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                            title="Publier">
                            {busyId === p.id && pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Publier
                          </button>
                          <button onClick={() => run([p.id], "rejete", "Rejeter cette annonce ?")} disabled={pending}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                            title="Rejeter">
                            <XCircle className="w-3.5 h-3.5" /> Rejeter
                          </button>
                        </>
                      )}
                      <Link href={`/admin/annonces/${p.id}`} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Voir / Modérer">
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
