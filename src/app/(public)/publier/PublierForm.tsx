"use client"

import { useActionState, useRef, useState, useCallback, useEffect } from "react"
import { publierAnnonce } from "./actions"
import {
  CheckCircle2, Loader2, AlertCircle, Upload, X,
  ImageIcon, Film, ArrowRight, Plus, Pencil,
} from "lucide-react"
import { usePropertyTypes } from "@/hooks/usePropertyTypes"

interface Zone { id: string; nom: string }

// Types de résidence meublée → mappés vers une catégorie/nb pièces de la base.
const RESID_TYPES = [
  { value: "studio",        label: "Studio",                     categorie: "studio",      pieces: 1 },
  { value: "2pieces",       label: "2 pièces (chambre salon)",   categorie: "appartement", pieces: 2 },
  { value: "3pieces",       label: "3 pièces (chambre salon)",   categorie: "appartement", pieces: 3 },
  { value: "villa_piscine", label: "Villa avec piscine",         categorie: "maison",      pieces: null as number | null },
  { value: "autre",         label: "Autre",                      categorie: "autre",       pieces: null as number | null },
]

const PERIODES = [
  { value: "nuit",    label: "par nuit" },
  { value: "semaine", label: "par semaine" },
  { value: "mois",    label: "par mois" },
]

const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
const labelCls = "block text-sm font-medium text-gray-700 mb-1.5"

// ── Étape 2 : upload médias ────────────────────────────────────────────────
interface PreviewFile { file: File; preview: string; type: "image" | "video" }

function MediaUploadStep({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const [files, setFiles] = useState<PreviewFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return
    const added: PreviewFile[] = []
    Array.from(incoming).forEach(f => {
      const isVideo = f.type.startsWith("video/")
      const preview = isVideo ? "" : URL.createObjectURL(f)
      added.push({ file: f, preview, type: isVideo ? "video" : "image" })
    })
    setFiles(prev => [...prev, ...added].slice(0, 10))
  }, [])

  const removeFile = (idx: number) => {
    setFiles(prev => {
      const next = [...prev]
      if (next[idx].preview) URL.revokeObjectURL(next[idx].preview)
      next.splice(idx, 1)
      return next
    })
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  // Upload DIRECT navigateur → R2 (URL présignée), puis enregistrement en base.
  // Contourne la limite de corps serverless (~4,5 Mo sur Vercel) qui bloquait
  // les vidéos avec une erreur « Request Entity Too Large ».
  const upload = async () => {
    if (files.length === 0) { onDone(); return }
    setUploading(true)
    setUploadErrors([])
    const errs: string[] = []
    const toRecord: { key: string; type: "image" | "video" }[] = []
    try {
      for (const pf of files) {
        try {
          const presignRes = await fetch(`/api/annonces/${propertyId}/media/presign`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: [{ name: pf.file.name, contentType: pf.file.type, size: pf.file.size }] }),
          })
          const presign = await presignRes.json().catch(() => null) as
            { items?: { key: string; uploadUrl: string; type: "image" | "video"; contentType: string }[]; errors?: string[] } | null
          if (!presignRes.ok || !presign) { errs.push(`${pf.file.name} : préparation de l'envoi impossible.`); continue }
          if (presign.errors?.length) errs.push(...presign.errors)
          const item = presign.items?.[0]
          if (!item) continue

          const put = await fetch(item.uploadUrl, { method: "PUT", headers: { "Content-Type": item.contentType }, body: pf.file })
          if (!put.ok) { errs.push(`${pf.file.name} : envoi vers le stockage refusé (${put.status}).`); continue }
          toRecord.push({ key: item.key, type: item.type })
        } catch (e) {
          errs.push(`${pf.file.name} : ${(e as Error).message}`)
        }
      }

      if (toRecord.length > 0) {
        const rec = await fetch(`/api/annonces/${propertyId}/media`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: toRecord }),
        })
        const json = await rec.json().catch(() => null) as { created?: unknown[]; errors?: string[] } | null
        if (json?.errors?.length) errs.push(...json.errors)
        if (!json) errs.push("Médias envoyés mais enregistrement impossible.")
      }

      setUploadErrors(errs)
      // Succès si au moins un média enregistré, ou aucune erreur.
      if (toRecord.length > 0 && errs.length === 0) setDone(true)
      else if (errs.length === 0) setDone(true)
    } catch (e) {
      setUploadErrors([...errs, (e as Error).message])
    } finally {
      setUploading(false)
    }
  }

  if (done && uploadErrors.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
        <p className="font-semibold text-gray-900">Photos et vidéos envoyées !</p>
        <p className="text-xs text-gray-400 mt-1 mb-4">Votre annonce est en cours de vérification.</p>
        <a href="/" className="text-sm text-blue-700 font-medium">Retour à l&apos;accueil →</a>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold text-gray-900 mb-1">Ajoutez des photos et vidéos <span className="text-gray-400 font-normal text-sm">(facultatif)</span></p>
        <p className="text-xs text-gray-500">Les annonces avec photos et vidéos reçoivent 5× plus de contacts. Formats : JPG, PNG, MP4, MOV… · Max 200 Mo par fichier · 10 fichiers max.</p>
      </div>

      {/* Zone de drop */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
      >
        <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-1">Glissez vos fichiers ici ou <span className="text-blue-600 font-medium">parcourir</span></p>
        <p className="text-xs text-gray-400">Photos JPG/PNG · Vidéos MP4/MOV</p>
        <input
          ref={inputRef} type="file" multiple accept="image/*,video/*"
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Prévisualisation */}
      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {files.map((pf, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
              {pf.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pf.preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <Film className="w-6 h-6 text-gray-400" />
                  <p className="text-xs text-gray-400 text-center px-1 truncate max-w-full">{pf.file.name}</p>
                </div>
              )}
              <div className="absolute top-1 left-1">
                {pf.type === "image"
                  ? <ImageIcon className="w-3.5 h-3.5 text-white drop-shadow" />
                  : <Film className="w-3.5 h-3.5 text-white drop-shadow" />}
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeFile(i) }}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          {files.length < 10 && (
            <button type="button" onClick={() => inputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center hover:border-blue-400 transition-colors">
              <Plus className="w-5 h-5 text-gray-300" />
            </button>
          )}
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
          {uploadErrors.map((e, i) => (
            <p key={i} className="text-xs text-red-600">{e}</p>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onDone}
          className="flex-1 text-sm text-gray-500 hover:text-gray-700 py-3 border border-gray-200 rounded-xl transition-colors">
          Passer cette étape
        </button>
        <button type="button" onClick={upload} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Upload en cours…</>
            : files.length > 0
              ? <><ArrowRight className="w-4 h-4" /> Envoyer ({files.length} fichier{files.length > 1 ? "s" : ""})</>
              : "Continuer sans photos"}
        </button>
      </div>
    </div>
  )
}

// ── Étape finale : confirmation ────────────────────────────────────────────
function SuccessScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle2 className="w-14 h-14 text-green-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900 mb-2">Annonce soumise avec succès !</h2>
      <p className="text-gray-500 text-sm max-w-sm leading-relaxed mb-5">
        Votre annonce est en cours de vérification par notre équipe.
        Vous serez contacté(e) sur le numéro fourni une fois validée.
      </p>
      <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 max-w-xs mb-6">
        Délai habituel : quelques heures en semaine. Nos agents peuvent vous
        appeler pour des précisions.
      </p>
      <div className="flex gap-3">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 border border-gray-200 rounded-xl">
          Accueil
        </a>
        <a href="/publier" className="text-sm bg-blue-700 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-800">
          Nouvelle annonce
        </a>
      </div>
    </div>
  )
}

interface InitialContact { nom: string | null; telephone: string | null }

// ── Formulaire principal ───────────────────────────────────────────────────
export default function PublierForm({
  villes, residence = false, initialContact = null,
}: {
  villes: Zone[]; residence?: boolean; initialContact?: InitialContact | null
}) {
  const [state, action, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => publierAnnonce(fd),
    null,
  )
  // Types de biens gérés par l'admin (dynamiques — ex. « Villa » si ajouté),
  // + « Autre » en fin de liste pour les biens hors catégories standards.
  const { options: adminCats } = usePropertyTypes()
  const CATEGORIES = [...adminCats, { value: "autre", label: "Autre" }]
  const [mediaUploaded, setMediaUploaded] = useState(false)
  const [villeId, setVilleId] = useState(villes[0]?.id ?? "")
  const [villeNom, setVilleNom] = useState(villes[0]?.nom ?? "")
  const [quartiers, setQuartiers] = useState<Zone[]>([])
  // Résidences meublées : type + période de tarification
  const [residType, setResidType] = useState("studio")
  const [periode, setPeriode] = useState("nuit")
  // Type d'annonce (location/vente/cession) — pilote les sections de conditions.
  const [typeOffre, setTypeOffre] = useState("location")
  // Coordonnées déjà connues (compte connecté) : on ne les redemande pas, sauf
  // si l'utilisateur souhaite les corriger.
  const hasKnownContact = !!(initialContact?.nom && initialContact?.telephone)
  const [editContact, setEditContact] = useState(!hasKnownContact)

  useEffect(() => {
    if (!villeId) { setQuartiers([]); return }
    fetch(`/api/zones/quartiers?ville_id=${villeId}`)
      .then(r => r.json())
      .then((data: Zone[]) => setQuartiers(data))
      .catch(() => setQuartiers([]))
  }, [villeId])

  function handleVilleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setVilleId(id)
    setVilleNom(villes.find(v => v.id === id)?.nom ?? "")
  }

  // Étape 3 : confirmation finale
  if (state?.ok && mediaUploaded) return <SuccessScreen />

  // Étape 2 : upload médias
  if (state?.ok && state.propertyId) {
    return (
      <MediaUploadStep
        propertyId={state.propertyId}
        onDone={() => setMediaUploaded(true)}
      />
    )
  }

  // Étape 1 : formulaire
  return (
    <form action={action} className="space-y-8">
      {state?.error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      {/* Type de transaction */}
      {residence ? (
        <>
          <input type="hidden" name="type_offre" value="residence_meublee" />
          <input type="hidden" name="meuble" value="oui" />
          <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-teal-900">Publier une résidence meublée</p>
            <p className="text-xs text-teal-700 mt-0.5">
              Appartement / studio meublé à mettre en location courte ou moyenne durée. Après vérification
              par notre équipe, il apparaîtra dans le catalogue des résidences meublées.
            </p>
          </div>
        </>
      ) : (
        <div>
          <label className={labelCls}>Type d&apos;annonce <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: "location", label: "Location", desc: "Maison, studio, appartement…" },
              { value: "vente", label: "Vente", desc: "Terrain, maison, local…" },
              { value: "cession", label: "Cession", desc: "Fonds de commerce, bail à céder…" },
            ].map(opt => (
              <label key={opt.value} className="relative cursor-pointer">
                <input type="radio" name="type_offre" value={opt.value} defaultChecked={opt.value === "location"}
                  onChange={() => setTypeOffre(opt.value)} className="peer sr-only" required />
                <div className="border-2 border-gray-200 rounded-xl p-4 peer-checked:border-blue-600 peer-checked:bg-blue-50 transition-all">
                  <p className="font-semibold text-gray-900 text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Type de résidence (résidences) OU catégorie (annonces classiques) */}
      {residence ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="resid_type" className={labelCls}>Type de résidence <span className="text-red-500">*</span></label>
            {/* La catégorie + nb pièces réelles sont dérivées du type choisi */}
            <input type="hidden" name="categorie" value={RESID_TYPES.find(t => t.value === residType)?.categorie ?? "appartement"} />
            <input type="hidden" name="residence_type_label" value={RESID_TYPES.find(t => t.value === residType)?.label ?? ""} />
            {(() => {
              const p = RESID_TYPES.find(t => t.value === residType)?.pieces
              return p ? <input type="hidden" name="nb_pieces" value={p} /> : null
            })()}
            <select id="resid_type" value={residType} onChange={e => setResidType(e.target.value)} className={inputCls}>
              {RESID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {residType === "autre" && (
            <div>
              <label htmlFor="residence_autre" className={labelCls}>Précisez le type de résidence <span className="text-red-500">*</span></label>
              <input id="residence_autre" name="residence_autre" type="text" required={residType === "autre"}
                placeholder="Ex : Loft, suite, duplex meublé…" className={inputCls} maxLength={80} />
            </div>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="categorie" className={labelCls}>Catégorie du bien <span className="text-red-500">*</span></label>
          <select id="categorie" name="categorie" required className={inputCls} defaultValue="">
            <option value="" disabled>Sélectionner…</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      )}

      {/* Titre optionnel */}
      <div>
        <label htmlFor="titre" className={labelCls}>Titre de l&apos;annonce <span className="text-gray-400 font-normal">(facultatif)</span></label>
        <input id="titre" name="titre" type="text" placeholder="Ex : Belle villa 4 pièces avec jardin"
          className={inputCls} maxLength={120} />
        <p className="text-xs text-gray-400 mt-1.5">Si vide, un titre sera généré automatiquement.</p>
      </div>

      {/* Prix */}
      <div>
        <label htmlFor="prix" className={labelCls}>
          {residence ? "Tarif de base" : "Prix"} <span className="text-red-500">*</span>
        </label>
        {residence ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input id="prix" name="prix" type="number" min="0" placeholder="Ex : 15000"
                className={`${inputCls} pr-16`} required />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">FCFA</span>
            </div>
            <select name="tarif_periode" value={periode} onChange={e => setPeriode(e.target.value)}
              className={`${inputCls} sm:w-44`}>
              {PERIODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="relative">
            <input id="prix" name="prix" type="number" min="0" placeholder="Ex : 150000"
              className={`${inputCls} pr-16`} required />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">FCFA</span>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          {residence
            ? "Tarif de base à la nuit / semaine / mois. Vous pourrez ajouter des forfaits ci-dessous."
            : "Pour une location : loyer mensuel. Pour une vente : prix total."}
        </p>
      </div>

      {/* Forfaits spéciaux (résidences) */}
      {residence && (
        <div>
          <label htmlFor="forfaits" className={labelCls}>Forfaits spéciaux <span className="text-gray-400 font-normal">(facultatif)</span></label>
          <textarea id="forfaits" name="forfaits" rows={3}
            placeholder="Ex : 3 nuits à 30 000 FCFA (au lieu de 45 000) · Semaine à 80 000 FCFA · Mois à 250 000 FCFA"
            className={`${inputCls} resize-none`} maxLength={500} />
          <p className="text-xs text-gray-400 mt-1.5">Proposez des tarifs dégressifs ou des offres (week-end, semaine, mois…).</p>
        </div>
      )}

      {/* Localisation */}
      <div className="space-y-4">
        <p className={labelCls}>Localisation <span className="text-red-500">*</span></p>
        {/* hidden input pour soumettre le nom de la ville */}
        <input type="hidden" name="ville" value={villeNom} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ville_select" className="block text-xs text-gray-500 mb-1">Commune *</label>
            <select id="ville_select" value={villeId} onChange={handleVilleChange}
              required className={inputCls}>
              <option value="" disabled>Choisir une commune…</option>
              {villes.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="quartier" className="block text-xs text-gray-500 mb-1">Quartier</label>
            <select id="quartier" name="quartier" className={inputCls}
              disabled={quartiers.length === 0}>
              <option value="">Sélectionner un quartier…</option>
              {quartiers.map(q => <option key={q.id} value={q.nom}>{q.nom}</option>)}
              <option value="Autre">Autre (préciser dans la description)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Caractéristiques */}
      <div>
        <p className={labelCls}>Caractéristiques <span className="text-gray-400 font-normal">(facultatif)</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: "surface", label: "Surface (m²)", placeholder: "Ex : 80" },
            { name: "nb_pieces", label: "Nb pièces", placeholder: "Ex : 4" },
            { name: "nb_chambres", label: "Chambres", placeholder: "Ex : 2" },
          ].map(f => (
            <div key={f.name}>
              <label htmlFor={f.name} className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input id={f.name} name={f.name} type="number" min="0" placeholder={f.placeholder}
                className={inputCls} />
            </div>
          ))}
          {!residence && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Meublé ?</label>
              <select name="meuble" className={inputCls}>
                <option value="non">Non meublé</option>
                <option value="oui">Meublé</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Conditions de location (maison, appartement, studio, local… en location) */}
      {!residence && typeOffre === "location" && (
        <div>
          <p className={labelCls}>Conditions de location <span className="text-gray-400 font-normal">(facultatif)</span></p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="mois_caution" className="block text-xs text-gray-500 mb-1">Caution (mois)</label>
              <input id="mois_caution" name="mois_caution" type="number" min="0" placeholder="Ex : 2" className={inputCls} />
            </div>
            <div>
              <label htmlFor="mois_avance" className="block text-xs text-gray-500 mb-1">Avance (mois)</label>
              <input id="mois_avance" name="mois_avance" type="number" min="0" placeholder="Ex : 2" className={inputCls} />
            </div>
            <div>
              <label htmlFor="mois_agence" className="block text-xs text-gray-500 mb-1">Frais d&apos;agence (mois)</label>
              <input id="mois_agence" name="mois_agence" type="number" min="0" placeholder="Ex : 1" className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Nombre de mois de loyer exigés à l&apos;entrée dans le logement.</p>
        </div>
      )}

      {/* Conditions de cession (magasins, entrepôts, locaux commerciaux, fonds de commerce à céder) */}
      {!residence && typeOffre === "cession" && (
        <div>
          <p className={labelCls}>Conditions de cession <span className="text-gray-400 font-normal">(facultatif)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cout_cession" className="block text-xs text-gray-500 mb-1">Pas de porte / coût de cession (FCFA)</label>
              <input id="cout_cession" name="cout_cession" type="number" min="0" placeholder="Ex : 2 500 000" className={inputCls} />
            </div>
            <div>
              <label htmlFor="loyer_cession" className="block text-xs text-gray-500 mb-1">Loyer mensuel après reprise (FCFA)</label>
              <input id="loyer_cession" name="loyer_cession" type="number" min="0" placeholder="Ex : 50 000" className={inputCls} />
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="conditions_acquisition" className="block text-xs text-gray-500 mb-1">Conditions d&apos;acquisition</label>
            <textarea id="conditions_acquisition" name="conditions_acquisition" rows={2}
              placeholder="Ex : 3 mois de caution inclus, matériel cédé avec le local…" className={`${inputCls} resize-none`} maxLength={500} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            S&apos;applique typiquement aux magasins, entrepôts, locaux commerciaux à céder (fonds de commerce, bail…).
          </p>
        </div>
      )}

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelCls}>Description</label>
        <textarea id="description" name="description" rows={4}
          placeholder="Décrivez le bien : état, équipements, commodités, conditions…"
          className={`${inputCls} resize-none`} maxLength={2000} />
      </div>

      {/* Contact propriétaire — déjà connu si compte connecté, pas besoin de redemander */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-amber-900 mb-0.5">Vos coordonnées <span className="text-red-500">*</span></p>
          <p className="text-xs text-amber-700">
            {hasKnownContact && !editContact
              ? "Déjà enregistrées sur votre compte. Elles restent strictement confidentielles."
              : <>Ces informations restent <strong>strictement confidentielles</strong> — elles ne seront jamais communiquées aux clients. Nos agents vous contacteront en cas de besoin.</>}
          </p>
        </div>

        {hasKnownContact && !editContact ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 truncate">{initialContact!.nom}</p>
              <p className="text-xs text-amber-700">{initialContact!.telephone}</p>
            </div>
            <button type="button" onClick={() => setEditContact(true)}
              className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 underline underline-offset-2 shrink-0">
              <Pencil className="w-3 h-3" /> Modifier
            </button>
            <input type="hidden" name="contact_nom" value={initialContact!.nom ?? ""} />
            <input type="hidden" name="contact_phone" value={initialContact!.telephone ?? ""} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contact_nom" className="block text-xs text-amber-800 font-medium mb-1.5">Nom complet</label>
              <input id="contact_nom" name="contact_nom" type="text" required
                defaultValue={initialContact?.nom ?? ""} placeholder="Votre nom" className={inputCls} />
            </div>
            <div>
              <label htmlFor="contact_phone" className="block text-xs text-amber-800 font-medium mb-1.5">Numéro WhatsApp</label>
              <input id="contact_phone" name="contact_phone" type="tel" required
                defaultValue={initialContact?.telephone ?? ""} placeholder="+225 07 00 00 00 00" className={inputCls} />
            </div>
          </div>
        )}
      </div>

      <button type="submit" disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-4 rounded-2xl transition-colors text-sm shadow-lg shadow-blue-200">
        {pending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
          : <><ArrowRight className="w-4 h-4" /> Continuer — Ajouter les photos/vidéos</>}
      </button>

      <p className="text-xs text-center text-gray-400">
        En soumettant, vous acceptez que nos agents vérifient et publient l&apos;annonce sur la plateforme.
        Inaya Immo prélève une <strong>commission sur la transaction</strong> uniquement en cas de mise en relation réussie.
      </p>
    </form>
  )
}
