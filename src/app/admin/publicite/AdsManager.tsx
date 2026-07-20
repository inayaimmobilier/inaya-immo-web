"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import {
  Megaphone, Plus, Trash2, Pencil, Loader2, Upload, X, Eye, EyeOff,
  LayoutGrid, RectangleHorizontal, Megaphone as Ticker, GalleryHorizontalEnd, Save,
} from "lucide-react"

// ============================================================================
// Gestion des espaces publicitaires (admin).
// - Liste des emplacements (ad_spaces) avec toggle actif
// - Liste des pubs (ad_items) par emplacement avec CRUD complet
// - Upload image/vidéo via R2 (presign → PUT direct)
// - Liaison optionnelle à une annonce existante (datalist)
// ============================================================================

interface Space {
  id: string; nom: string; slug: string; format: string; placement: string
  nb_slots: number; rotation_delay_sec: number; actif: boolean; ordre: number
}
interface Item {
  id: string; ad_space_id: string; titre: string; sous_titre: string | null
  description: string | null; cta_label: string | null; cta_lien: string | null
  image_url: string | null; video_url: string | null; couleur: string
  icone: string; property_id: string | null; priority: number; actif: boolean
  start_at: string | null; end_at: string | null
}

const FORMATS = [
  { val: "hero", label: "Hero (rectangle)", Icon: RectangleHorizontal },
  { val: "grid", label: "Grille de carrés", Icon: LayoutGrid },
  { val: "ticker", label: "Bandeau défilant", Icon: Ticker },
  { val: "carousel", label: "Carousel rotatif", Icon: GalleryHorizontalEnd },
]
const PLACEMENTS = [
  { val: "home", label: "Page d'accueil" },
  { val: "biens", label: "Page /biens" },
  { val: "detail", label: "Détail annonce" },
  { val: "global_header", label: "Header global" },
  { val: "global_sidebar", label: "Sidebar globale" },
  { val: "global_footer", label: "Footer global" },
]
const COULEURS = [
  { val: "blue", cls: "bg-blue-500" }, { val: "amber", cls: "bg-amber-500" },
  { val: "emerald", cls: "bg-emerald-500" }, { val: "purple", cls: "bg-purple-500" },
  { val: "rose", cls: "bg-rose-500" }, { val: "slate", cls: "bg-slate-500" },
]

const input = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"

export default function AdsManager({
  initialSpaces, initialItems, properties,
}: {
  initialSpaces: Space[]
  initialItems: Item[]
  properties: { id: string; titre: string }[]
}) {
  const [spaces, setSpaces] = useState<Space[]>(initialSpaces)
  const [items, setItems] = useState<Item[]>(initialItems)
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [isNewItem, setIsNewItem] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // ── Spaces ─────────────────────────────────────────────────────────────────
  async function saveSpace(s: Space) {
    setSaving(true); setError(null)
    try {
      const method = spaces.find(x => x.id === s.id) ? "PATCH" : "POST"
      const url = method === "PATCH" ? `/api/admin/ads/spaces/${s.id}` : "/api/admin/ads/spaces"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Échec")
      setSpaces(prev => {
        const exists = prev.find(x => x.id === json.id)
        return exists ? prev.map(x => x.id === json.id ? json : x) : [...prev, json]
      })
      setEditingSpace(null)
      setMsg("Emplacement enregistré.")
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  async function toggleSpace(s: Space) {
    await fetch(`/api/admin/ads/spaces/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actif: !s.actif }) })
    setSpaces(prev => prev.map(x => x.id === s.id ? { ...x, actif: !s.actif } : x))
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  const emptyItem = (adSpaceId: string): Item => ({
    id: "", ad_space_id: adSpaceId, titre: "", sous_titre: null, description: null,
    cta_label: null, cta_lien: null, image_url: null, video_url: null,
    couleur: "blue", icone: "📢", property_id: null, priority: 0, actif: true,
    start_at: null, end_at: null,
  })

  async function saveItem(it: Item) {
    setSaving(true); setError(null)
    try {
      const method = isNewItem ? "POST" : "PATCH"
      const url = isNewItem ? "/api/admin/ads/items" : `/api/admin/ads/items/${it.id}`
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(it) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Échec")
      setItems(prev => {
        const exists = prev.find(x => x.id === json.id)
        return exists ? prev.map(x => x.id === json.id ? json : x) : [json, ...prev]
      })
      setEditingItem(null); setIsNewItem(false)
      setMsg("Pub enregistrée.")
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  async function toggleItem(it: Item) {
    await fetch(`/api/admin/ads/items/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actif: !it.actif }) })
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, actif: !it.actif } : x))
  }

  async function deleteItem(it: Item) {
    if (!confirm(`Supprimer la pub « ${it.titre} » ?`)) return
    await fetch(`/api/admin/ads/items/${it.id}`, { method: "DELETE" })
    setItems(prev => prev.filter(x => x.id !== it.id))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-blue-600" /> Espaces publicitaires
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gérez les emplacements pub affichés sur le site. Créez des pubs avec images/vidéos,
          liez-les à des annonces existantes, ou faites défiler des messages.
        </p>
      </div>

      {msg && <div className="text-sm rounded-xl px-4 py-3 bg-green-50 border border-green-100 text-green-700">{msg}</div>}
      {error && <div className="text-sm rounded-xl px-4 py-3 bg-red-50 border border-red-100 text-red-700">{error}</div>}

      {/* ── EMPLACEMENTS ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Emplacements ({spaces.length})</h2>
          <button onClick={() => setEditingSpace({ id: "", nom: "", slug: "", format: "hero", placement: "home", nb_slots: 1, rotation_delay_sec: 5, actif: true, ordre: spaces.length })}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700">
            <Plus className="w-3.5 h-3.5" /> Nouvel emplacement
          </button>
        </div>
        <div className="space-y-2">
          {spaces.map(s => {
            const fmt = FORMATS.find(f => f.val === s.format)
            const place = PLACEMENTS.find(p => p.val === s.placement)
            const spaceItems = items.filter(it => it.ad_space_id === s.id)
            return (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  {fmt?.Icon ? <fmt.Icon className="w-4 h-4 text-blue-600" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.nom} <span className="text-gray-400 font-mono text-xs">/{s.slug}</span></p>
                  <p className="text-xs text-gray-500">{fmt?.label} · {place?.label} · {spaceItems.length} pub(s)</p>
                </div>
                <button onClick={() => toggleSpace(s)} title={s.actif ? "Visible" : "Masqué"} className={`p-1.5 rounded-lg ${s.actif ? "text-green-600" : "text-gray-300"}`}>
                  {s.actif ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => setEditingSpace(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── PUBS PAR EMPLACEMENT ────────────────────────────────────────── */}
      {spaces.filter(s => s.actif).map(s => {
        const spaceItems = items.filter(it => it.ad_space_id === s.id)
        return (
          <section key={s.id} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Pubs — {s.nom}</h2>
              <button onClick={() => { setEditingItem(emptyItem(s.id)); setIsNewItem(true) }}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-600">
                <Plus className="w-3.5 h-3.5" /> Ajouter une pub
              </button>
            </div>
            {spaceItems.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Aucune pub dans cet emplacement.</p>
            ) : (
              <div className="space-y-2">
                {spaceItems.map(it => (
                  <div key={it.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                      {it.image_url ? <Image src={it.image_url} alt="" width={48} height={48} className="object-cover w-full h-full" /> :
                       it.video_url ? <span className="text-lg">🎬</span> :
                       <span className="text-2xl">{it.icone}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">{it.titre || "(sans titre)"}</p>
                      <p className="text-xs text-gray-500">
                        {it.property_id ? "🔗 Annonce liée" : "Contenu libre"}
                        {it.cta_label ? ` · ${it.cta_label}` : ""}
                        {it.start_at || it.end_at ? " · programmée" : ""}
                      </p>
                    </div>
                    <button onClick={() => toggleItem(it)} className={`p-1.5 rounded-lg ${it.actif ? "text-green-600" : "text-gray-300"}`}>
                      {it.actif ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setEditingItem(it); setIsNewItem(false) }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteItem(it)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* ── MODAL ÉDITION EMPLACEMENT ───────────────────────────────────── */}
      {editingSpace && (
        <SpaceModal space={editingSpace} saving={saving} onClose={() => setEditingSpace(null)} onSave={saveSpace} />
      )}

      {/* ── MODAL ÉDITION PUB ───────────────────────────────────────────── */}
      {editingItem && (
        <ItemModal
          item={editingItem} isNew={isNewItem} saving={saving} properties={properties}
          onClose={() => { setEditingItem(null); setIsNewItem(false) }}
          onSave={saveItem}
          onUploaded={(field, url) => setEditingItem(prev => prev ? { ...prev, [field]: url } : prev)}
        />
      )}
    </div>
  )
}

// ── Modal édition emplacement ────────────────────────────────────────────────
function SpaceModal({ space, saving, onClose, onSave }: {
  space: Space; saving: boolean; onClose: () => void; onSave: (s: Space) => void
}) {
  const [s, setS] = useState<Space>(space)
  const set = (patch: Partial<Space>) => setS(prev => ({ ...prev, ...patch }))

  return (
    <Modal onClose={onClose} title={space.id ? "Modifier l'emplacement" : "Nouvel emplacement"}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
          <input value={s.nom} onChange={e => set({ nom: e.target.value })} className={input} placeholder="Accueil — Hero" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Slug (identifiant URL)</label>
          <input value={s.slug} onChange={e => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className={`${input} font-mono`} placeholder="home-hero" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
            <select value={s.format} onChange={e => set({ format: e.target.value })} className={`${input} bg-white`}>
              {FORMATS.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Placement</label>
            <select value={s.placement} onChange={e => set({ placement: e.target.value })} className={`${input} bg-white`}>
              {PLACEMENTS.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Slots visibles</label>
            <input type="number" min={1} value={s.nb_slots} onChange={e => set({ nb_slots: Math.max(1, Number(e.target.value)) })} className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Délai rotation (s)</label>
            <input type="number" min={1} value={s.rotation_delay_sec} onChange={e => set({ rotation_delay_sec: Math.max(1, Number(e.target.value)) })} className={input} />
          </div>
        </div>
        <SaveBar saving={saving} onSave={() => onSave(s)} onCancel={onClose} />
      </div>
    </Modal>
  )
}

// ── Modal édition pub ────────────────────────────────────────────────────────
function ItemModal({ item, isNew, saving, properties, onClose, onSave, onUploaded }: {
  item: Item; isNew: boolean; saving: boolean
  properties: { id: string; titre: string }[]
  onClose: () => void; onSave: (it: Item) => void
  onUploaded: (field: "image_url" | "video_url", url: string) => void
}) {
  const [it, setIt] = useState<Item>(item)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Item>) => setIt(prev => ({ ...prev, ...patch }))

  // Upload direct navigateur → R2 (presign → PUT → enregistrement)
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !it.id) {
      setUploadErr(it.id ? null : "Sauvegardez d'abord la pub pour pouvoir uploader un média.")
      return
    }
    setUploading(true); setUploadErr(null)
    try {
      for (const file of Array.from(files)) {
        const presignRes = await fetch(`/api/admin/ads/${it.id}/media/presign`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [{ name: file.name, contentType: file.type, size: file.size }] }),
        })
        const presign = await presignRes.json() as { items?: { key: string; uploadUrl: string; type: "image" | "video"; contentType: string }[]; errors?: string[] }
        if (!presignRes.ok || !presign.items?.[0]) { setUploadErr(presign.errors?.[0] || "Échec presign"); continue }
        const item0 = presign.items[0]
        const put = await fetch(item0.uploadUrl, { method: "PUT", headers: { "Content-Type": item0.contentType }, body: file })
        if (!put.ok) { setUploadErr("Upload R2 refusé"); continue }
        // Enregistre l'URL dans la pub (PATCH direct pour persister immédiatement)
        const field = item0.type === "video" ? "video_url" : "image_url"
        const pubUrl = presign.items[0].key ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${item0.key}` : ""
        // On calcule l'URL publique via le même helper que le serveur : NEXT_PUBLIC_R2_PUBLIC_URL/key
        const res = await fetch(`/api/admin/ads/items/${it.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: pubUrl }),
        })
        const json = await res.json()
        if (res.ok && json[field]) {
          set({ [field]: json[field] } as Partial<Item>)
          onUploaded(field, json[field])
        }
      }
    } catch (e) { setUploadErr((e as Error).message) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  return (
    <Modal onClose={onClose} title={isNew ? "Nouvelle pub" : "Modifier la pub"} wide>
      <div className="space-y-3">
        {/* Liaison annonce existante */}
        <div className="bg-blue-50 rounded-xl p-3 space-y-2">
          <label className="block text-xs font-medium text-blue-900">
            Lier à une annonce existante <span className="text-blue-500 font-normal">(optionnel)</span>
          </label>
          <input
            list="properties-list" value={it.property_id ?? ""}
            onChange={e => set({ property_id: e.target.value || null })}
            placeholder="Choisir une annonce (titre)…"
            className={input}
          />
          <datalist id="properties-list">
            {properties.map(p => <option key={p.id} value={p.id}>{p.titre}</option>)}
          </datalist>
          <p className="text-[11px] text-blue-700">Si liée, le titre/photo/lien du bien seront auto-utilisés côté public.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
          <input value={it.titre} onChange={e => set({ titre: e.target.value })} className={input} placeholder="Villa moderne avec piscine" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sous-titre</label>
            <input value={it.sous_titre ?? ""} onChange={e => set({ sous_titre: e.target.value || null })} className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Icône (emoji)</label>
            <input value={it.icone} onChange={e => set({ icone: e.target.value })} className={`${input} text-center text-xl`} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={it.description ?? ""} onChange={e => set({ description: e.target.value || null })} rows={2} className={`${input} resize-none`} />
        </div>

        {/* Médias */}
        <div className="border border-gray-200 rounded-xl p-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">Image / Vidéo (upload direct)</label>
          {it.image_url && (
            <div className="relative w-full h-32 rounded-lg overflow-hidden bg-gray-100">
              <Image src={it.image_url} alt="" fill className="object-cover" sizes="400px" />
              <button onClick={() => set({ image_url: null })} className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white"><X className="w-3 h-3" /></button>
            </div>
          )}
          {it.video_url && (
            <div className="flex items-center gap-2 text-xs">
              <span>🎬 Vidéo uploadée</span>
              <button onClick={() => set({ video_url: null })} className="text-red-500"><X className="w-3 h-3" /></button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || isNew}
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {isNew ? "Sauvegardez avant upload" : "Uploader image/vidéo"}
          </button>
          {uploadErr && <p className="text-xs text-red-600">{uploadErr}</p>}
          {!it.image_url && !it.video_url && <p className="text-[11px] text-gray-400">Sans média, la pub utilise sa couleur + icône.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Texte du bouton</label>
            <input value={it.cta_label ?? ""} onChange={e => set({ cta_label: e.target.value || null })} className={input} placeholder="Voir l'annonce" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lien URL</label>
            <input value={it.cta_lien ?? ""} onChange={e => set({ cta_lien: e.target.value || null })} className={input} placeholder="/biens/..." />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Couleur (si pas de média)</label>
          <div className="flex gap-2 flex-wrap pt-1">
            {COULEURS.map(c => (
              <button key={c.val} onClick={() => set({ couleur: c.val })}
                className={`w-7 h-7 rounded-full ${c.cls} transition-transform ${it.couleur === c.val ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priorité</label>
            <input type="number" value={it.priority} onChange={e => set({ priority: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Active</label>
            <button onClick={() => set({ actif: !it.actif })} className={`relative inline-flex h-6 w-11 items-center rounded-full ${it.actif ? "bg-green-600" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${it.actif ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>

        <SaveBar saving={saving} onSave={() => onSave(it)} onCancel={onClose} />
      </div>
    </Modal>
  )
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl p-6 w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SaveBar({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <button onClick={onSave} disabled={saving}
        className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
      </button>
      <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annuler</button>
    </div>
  )
}
