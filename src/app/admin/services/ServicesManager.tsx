"use client"

import { useRef, useState } from "react"
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, X, Save, Loader2, Upload } from "lucide-react"

const COULEURS = [
  { val: "blue",    label: "Bleu",   cls: "bg-blue-500"    },
  { val: "amber",   label: "Ambre",  cls: "bg-amber-500"   },
  { val: "emerald", label: "Vert",   cls: "bg-emerald-500" },
  { val: "purple",  label: "Violet", cls: "bg-purple-500"  },
  { val: "rose",    label: "Rose",   cls: "bg-rose-500"    },
  { val: "slate",   label: "Gris",   cls: "bg-slate-500"   },
]

const CATEGORIES = [
  { val: "gestion",      label: "Gestion immobilière" },
  { val: "meuble",       label: "Résidences meublées" },
  { val: "maintenance",  label: "Maintenance & Travaux" },
  { val: "publicite",    label: "Publicité externe" },
  { val: "autre",        label: "Autre" },
]

const COULEUR_PREVIEW: Record<string, string> = {
  blue:    "bg-blue-50 border-blue-200 text-blue-800",
  amber:   "bg-amber-50 border-amber-200 text-amber-800",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  purple:  "bg-purple-50 border-purple-200 text-purple-800",
  rose:    "bg-rose-50 border-rose-200 text-rose-800",
  slate:   "bg-slate-50 border-slate-200 text-slate-800",
}

export interface Banner {
  id: string
  titre: string
  sous_titre: string | null
  description: string | null
  categorie: string
  icone: string
  couleur: string
  cta_label: string | null
  cta_lien: string | null
  image_url: string | null
  actif: boolean
  ordre: number
}

const EMPTY: Omit<Banner, "id" | "ordre"> = {
  titre: "", sous_titre: "", description: "", categorie: "autre",
  icone: "🏠", couleur: "blue", cta_label: "", cta_lien: "",
  image_url: "", actif: true,
}

export default function ServicesManager({ initialBanners }: { initialBanners: Banner[] }) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Upload de l'image d'illustration (depuis PC/téléphone)
  const imgFileRef = useRef<HTMLInputElement>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const [imgUploadErr, setImgUploadErr] = useState<string | null>(null)

  /** Upload : PUT direct navigateur → R2 (gros fichiers) avec repli via le
   *  serveur (sans CORS, ≤ 4 Mo). L'URL publique remplit image_url. */
  async function uploadIllustration(file: File | null) {
    if (!file) return
    setImgUploadErr(null)
    setImgUploading(true)
    try {
      let publicUrl: string | null = null
      // 1) Voie directe (présignature) — échoue si le CORS R2 n'est pas configuré.
      try {
        const pres = await fetch("/api/admin/services/upload", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, contentType: file.type }),
        })
        const pj = await pres.json() as { uploadUrl?: string; publicUrl?: string; contentType?: string; error?: string }
        if (!pres.ok || !pj.uploadUrl) throw new Error(pj.error || "presign")
        const put = await fetch(pj.uploadUrl, { method: "PUT", headers: { "Content-Type": pj.contentType ?? file.type }, body: file })
        if (!put.ok) throw new Error("PUT refusé")
        publicUrl = pj.publicUrl ?? null
      } catch {
        // 2) Repli proxy serveur (≤ 4 Mo)
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/admin/services/upload", { method: "POST", body: fd })
        const j = await res.json() as { publicUrl?: string; error?: string }
        if (!res.ok || !j.publicUrl) throw new Error(j.error || "Envoi impossible.")
        publicUrl = j.publicUrl
      }
      if (publicUrl) setEditing(p => p && ({ ...p, image_url: publicUrl }))
    } catch (e) {
      setImgUploadErr((e as Error).message)
    } finally {
      setImgUploading(false)
      if (imgFileRef.current) imgFileRef.current.value = ""
    }
  }

  function openNew() {
    setEditing({ id: "", ordre: banners.length, ...EMPTY })
    setIsNew(true)
    setError(null)
  }

  function openEdit(b: Banner) {
    setEditing({ ...b })
    setIsNew(false)
    setError(null)
  }

  async function save() {
    if (!editing) return
    if (!editing.titre.trim()) { setError("Le titre est obligatoire"); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        titre: editing.titre.trim(),
        sous_titre: editing.sous_titre?.trim() || null,
        description: editing.description?.trim() || null,
        categorie: editing.categorie,
        icone: editing.icone.trim() || "🏠",
        couleur: editing.couleur,
        cta_label: editing.cta_label?.trim() || null,
        cta_lien: editing.cta_lien?.trim() || null,
        image_url: editing.image_url?.trim() || null,
        actif: editing.actif,
        ordre: editing.ordre,
      }
      if (isNew) {
        const res = await fetch("/api/admin/services", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setBanners(prev => [...prev, data as Banner].sort((a, b) => a.ordre - b.ordre))
      } else {
        const res = await fetch(`/api/admin/services/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setBanners(prev => prev.map(b => b.id === editing.id ? data as Banner : b).sort((a, b) => a.ordre - b.ordre))
      }
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActif(b: Banner) {
    const res = await fetch(`/api/admin/services/${b.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !b.actif }),
    })
    if (res.ok) setBanners(prev => prev.map(x => x.id === b.id ? { ...x, actif: !x.actif } : x))
  }

  async function remove(b: Banner) {
    if (!confirm(`Supprimer "${b.titre}" ?`)) return
    const res = await fetch(`/api/admin/services/${b.id}`, { method: "DELETE" })
    if (res.ok) setBanners(prev => prev.filter(x => x.id !== b.id))
  }

  async function moveOrdre(b: Banner, dir: -1 | 1) {
    const sorted = [...banners].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(x => x.id === b.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    await Promise.all([
      fetch(`/api/admin/services/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordre: other.ordre }) }),
      fetch(`/api/admin/services/${other.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordre: b.ordre }) }),
    ])
    setBanners(prev => prev.map(x => {
      if (x.id === b.id) return { ...x, ordre: other.ordre }
      if (x.id === other.id) return { ...x, ordre: b.ordre }
      return x
    }).sort((a, b) => a.ordre - b.ordre))
  }

  const sorted = [...banners].sort((a, b) => a.ordre - b.ordre)

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Espaces publicitaires</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ces blocs s&apos;affichent sur la page d&apos;accueil pour mettre en valeur les services Inaya.
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nouveau service
        </button>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-gray-400 text-sm">Aucun service configuré. Créez votre premier bloc.</p>
          </div>
        )}
        {sorted.map((b, i) => (
          <div key={b.id}
            className={`bg-white rounded-2xl border p-4 flex items-start gap-4 transition-opacity ${b.actif ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
            {/* Ordre */}
            <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
              <button onClick={() => moveOrdre(b, -1)} disabled={i === 0}
                className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                <GripVertical className="w-4 h-4 rotate-90 scale-x-[-1]" />
              </button>
              <span className="text-xs text-gray-400 font-mono">{i + 1}</span>
              <button onClick={() => moveOrdre(b, 1)} disabled={i === sorted.length - 1}
                className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                <GripVertical className="w-4 h-4 rotate-90" />
              </button>
            </div>

            {/* Icône + couleur */}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border shrink-0 ${COULEUR_PREVIEW[b.couleur]}`}>
              {b.icone}
            </div>

            {/* Contenu */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">{b.titre}</p>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {CATEGORIES.find(c => c.val === b.categorie)?.label ?? b.categorie}
                </span>
                {!b.actif && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Masqué</span>
                )}
              </div>
              {b.sous_titre && <p className="text-xs text-gray-500 mt-0.5">{b.sous_titre}</p>}
              {b.cta_lien && (
                <p className="text-xs text-blue-600 mt-1 truncate">
                  {b.cta_label ? `${b.cta_label} → ` : ""}{b.cta_lien}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggleActif(b)} title={b.actif ? "Masquer" : "Afficher"}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                {b.actif ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={() => openEdit(b)} title="Modifier"
                className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => remove(b)} title="Supprimer"
                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modale édition */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{isNew ? "Nouveau service" : "Modifier le service"}</h2>
              <button onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Icône (emoji) *</label>
                <input value={editing.icone} onChange={e => setEditing(p => p && ({ ...p, icone: e.target.value }))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-2xl text-center focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
                <input value={editing.titre} onChange={e => setEditing(p => p && ({ ...p, titre: e.target.value }))}
                  placeholder="Gestion immobilière"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sous-titre</label>
                <input value={editing.sous_titre ?? ""} onChange={e => setEditing(p => p && ({ ...p, sous_titre: e.target.value }))}
                  placeholder="Confiez votre bien à nos experts"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={editing.description ?? ""} onChange={e => setEditing(p => p && ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Décrivez le service en quelques phrases..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 resize-y" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
                  <select value={editing.categorie} onChange={e => setEditing(p => p && ({ ...p, categorie: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white">
                    {CATEGORIES.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Couleur</label>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {COULEURS.map(c => (
                      <button key={c.val} title={c.label} onClick={() => setEditing(p => p && ({ ...p, couleur: c.val }))}
                        className={`w-6 h-6 rounded-full ${c.cls} transition-transform ${editing.couleur === c.val ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Texte du bouton</label>
                  <input value={editing.cta_label ?? ""} onChange={e => setEditing(p => p && ({ ...p, cta_label: e.target.value }))}
                    placeholder="En savoir plus"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Lien URL</label>
                  <input value={editing.cta_lien ?? ""} onChange={e => setEditing(p => p && ({ ...p, cta_lien: e.target.value }))}
                    placeholder="/services/gestion"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Image d&apos;illustration</label>
                {editing.image_url && (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden bg-gray-100 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editing.image_url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setEditing(p => p && ({ ...p, image_url: "" }))}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80" title="Retirer l'image">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {/* accept="image/*" : sur téléphone, ouvre l'appareil photo / la galerie */}
                <input ref={imgFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => uploadIllustration(e.target.files?.[0] ?? null)} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => imgFileRef.current?.click()} disabled={imgUploading}
                    className="inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 shrink-0">
                    {imgUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {imgUploading ? "Envoi…" : "Uploader depuis l'appareil"}
                  </button>
                  <input value={editing.image_url ?? ""} onChange={e => setEditing(p => p && ({ ...p, image_url: e.target.value }))}
                    placeholder="…ou coller une URL https://"
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                </div>
                {imgUploadErr && <p className="text-xs text-red-600 mt-1">{imgUploadErr}</p>}
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${editing.actif ? "bg-blue-600" : "bg-gray-200"}`}
                  onClick={() => setEditing(p => p && ({ ...p, actif: !p.actif }))}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editing.actif ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
                <span className="text-sm text-gray-700">Visible sur la page d&apos;accueil</span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditing(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
