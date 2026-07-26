"use client"

import { useState } from "react"
import { countMatching, bulkDelete, type DeleteCriteria } from "./actions"

type Row = { id: string; reference: number | null; titre: string; prix: number | null; type_offre: string; statut: string; created_at: string }

const OFFRES = [
  { v: "", l: "Tous les types d'offre" },
  { v: "location", l: "Location" }, { v: "vente", l: "Vente" },
  { v: "cession", l: "Cession" }, { v: "residence_meublee", l: "Résidence meublée" },
]
const STATUTS = [
  { v: "", l: "Tous les statuts" },
  { v: "publie", l: "Publiée" }, { v: "en_attente_validation", l: "En attente" },
  { v: "rejete", l: "Rejetée" }, { v: "expire", l: "Expirée" }, { v: "suspendu", l: "Suspendue" },
]

const fmt = (n: number | null) => (n != null ? n.toLocaleString("fr-FR") + " F" : "—")
const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"

export default function SuppressionForm() {
  const [typeOffre, setTypeOffre] = useState("")
  const [statut, setStatut] = useState("")
  const [prixMin, setPrixMin] = useState("")
  const [prixMax, setPrixMax] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const [preview, setPreview] = useState<{ count: number; sample: Row[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function criteria(): DeleteCriteria {
    return {
      type_offre: typeOffre || undefined,
      statut: statut || undefined,
      prix_min: prixMin ? Number(prixMin) : null,
      prix_max: prixMax ? Number(prixMax) : null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    }
  }

  async function doPreview() {
    setErr(null); setMsg(null); setConfirming(false); setPreview(null); setBusy(true)
    const r = await countMatching(criteria())
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setPreview({ count: r.count, sample: r.sample })
    if (r.count > 0) setConfirming(true)
  }

  async function doDelete() {
    setErr(null); setMsg(null); setBusy(true)
    const r = await bulkDelete(criteria())
    setBusy(false); setConfirming(false); setPreview(null)
    if (!r.ok) { setErr(r.error); return }
    setMsg(
      `${r.deleted} annonce(s) supprimée(s).` +
      (r.skipped ? ` ${r.skipped} préservée(s) (liées à une transaction).` : "") +
      (r.capped ? " Limite de 500 atteinte — relancez pour supprimer le reste." : ""),
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Type d&apos;offre</span>
            <select value={typeOffre} onChange={e => setTypeOffre(e.target.value)} className={input}>
              {OFFRES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Statut</span>
            <select value={statut} onChange={e => setStatut(e.target.value)} className={input}>
              {STATUTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Budget min (FCFA)</span>
            <input value={prixMin} onChange={e => setPrixMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={input} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Budget max (FCFA)</span>
            <input value={prixMax} onChange={e => setPrixMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Illimité" className={input} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Publiée depuis le</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={input} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Jusqu&apos;au</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={input} />
          </label>
        </div>
        <button onClick={doPreview} disabled={busy}
          className="bg-blue-700 hover:bg-blue-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-60">
          {busy ? "…" : "Prévisualiser les annonces concernées"}
        </button>
      </div>

      {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{err}</div>}
      {msg && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-3">{msg}</div>}

      {preview && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-800">
            <b className="text-lg">{preview.count}</b> annonce(s) correspondent à ces critères.
          </p>
          {preview.sample.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3 space-y-1.5 max-h-72 overflow-y-auto">
              {preview.sample.map(r => (
                <div key={r.id} className="text-xs text-gray-600 flex justify-between gap-3">
                  <span className="truncate">{r.reference != null ? `N°${r.reference} · ` : ""}{r.titre}</span>
                  <span className="whitespace-nowrap text-gray-400">{r.type_offre} · {fmt(r.prix)} · {new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
                </div>
              ))}
              {preview.count > preview.sample.length && <p className="text-xs text-gray-400 pt-1">… et {preview.count - preview.sample.length} autre(s).</p>}
            </div>
          )}
          {confirming && (
            <div className="mt-4 flex items-center gap-3">
              <button onClick={doDelete} disabled={busy}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-60">
                {busy ? "Suppression…" : `Supprimer définitivement ces ${preview.count} annonce(s)`}
              </button>
              <button onClick={() => { setPreview(null); setConfirming(false) }} className="text-sm text-gray-500 hover:text-gray-800">Annuler</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
