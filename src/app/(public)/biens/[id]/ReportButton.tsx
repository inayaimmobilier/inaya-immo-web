"use client"

import { useState, useTransition } from "react"
import { Flag, Loader2, Check, X } from "lucide-react"
import { signalerAnnonce } from "./actions"

const CATEGORIES = [
  "Annonce frauduleuse",
  "Déjà vendu / loué",
  "Informations erronées",
  "Doublon",
  "Contenu inapproprié",
  "Autre",
]

export default function ReportButton({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [categorie, setCategorie] = useState("")
  const [motif, setMotif] = useState("")
  const [contact, setContact] = useState("")

  function submit() {
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.append("property_id", propertyId)
      fd.append("categorie", categorie)
      fd.append("motif", motif)
      fd.append("contact", contact)
      const res = await signalerAnnonce(fd)
      if (!res.ok) { setError(res.error); return }
      setDone(true)
    })
  }

  function close() {
    setOpen(false)
    // Reset après fermeture pour permettre un nouveau signalement propre.
    setTimeout(() => { setDone(false); setCategorie(""); setMotif(""); setContact(""); setError(null) }, 200)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Signaler cette annonce"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 transition-colors"
      >
        <Flag className="w-4 h-4" /> Signaler
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {done ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <p className="font-semibold text-gray-900 mb-1">Signalement envoyé</p>
                <p className="text-sm text-gray-500">Merci — notre équipe va vérifier cette annonce.</p>
                <button onClick={close} className="mt-5 text-sm font-medium text-blue-700 hover:underline">Fermer</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                    <Flag className="w-4 h-4 text-red-500" /> Signaler cette annonce
                  </h3>
                  <button onClick={close} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <p className="text-xs text-gray-500">
                  Aidez-nous à garder Inaya fiable. Le motif est facultatif.
                </p>

                {/* Catégorie (optionnelle) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Type de problème <span className="text-gray-400 font-normal">(optionnel)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <button key={c} type="button"
                        onClick={() => setCategorie(categorie === c ? "" : c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          categorie === c ? "bg-red-600 text-white border-red-600" : "border-gray-200 text-gray-600 hover:border-red-200 bg-white"
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Motif libre (optionnel) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Précisions <span className="text-gray-400 font-normal">(optionnel)</span></label>
                  <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3}
                    placeholder="Décrivez le problème rencontré…"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-gray-50 focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100 resize-none" />
                </div>

                {/* Contact (optionnel) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Votre contact <span className="text-gray-400 font-normal">(optionnel, si on doit vous recontacter)</span></label>
                  <input type="text" value={contact} onChange={e => setContact(e.target.value)}
                    placeholder="Email ou téléphone"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-gray-50 focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100" />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button onClick={close} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    Annuler
                  </button>
                  <button onClick={submit} disabled={pending}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                    Envoyer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
