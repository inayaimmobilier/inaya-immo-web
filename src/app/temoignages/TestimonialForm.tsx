"use client"

import { useState } from "react"
import { Star, Loader2, CheckCircle2 } from "lucide-react"
import { submitTestimonial } from "./actions"

export default function TestimonialForm() {
  const [nom, setNom] = useState("")
  const [note, setNote] = useState(0)
  const [hover, setHover] = useState(0)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (note < 1) { setError("Sélectionnez une note (1 à 5 étoiles)."); return }
    setLoading(true)
    try {
      const res = await submitTestimonial({ nom, note, message })
      if (!res.ok) { setError(res.error); setLoading(false); return }
      setDone(true)
    } catch {
      setError("Envoi impossible. Vérifiez votre connexion."); setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
        <h3 className="font-semibold text-gray-900">Merci pour votre avis !</h3>
        <p className="text-sm text-gray-600 mt-1">Il sera publié après validation par notre équipe.</p>
      </div>
    )
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Donnez votre avis sur Inaya Immo</h3>
      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}

      {/* Étoiles */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button"
            onClick={() => setNote(n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className="p-0.5" aria-label={`${n} étoile${n > 1 ? "s" : ""}`}>
            <Star className={`w-8 h-8 transition-colors ${(hover || note) >= n ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          </button>
        ))}
        {note > 0 && <span className="ml-2 text-sm text-gray-500">{note}/5</span>}
      </div>

      <input value={nom} onChange={e => setNom(e.target.value)} required placeholder="Votre nom" className={field} />
      <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={4}
        placeholder="Partagez votre expérience avec Inaya Immo…" className={`${field} resize-none`} />

      <button type="submit" disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</> : "Publier mon avis"}
      </button>
      <p className="text-[11px] text-gray-400 text-center">Votre avis sera vérifié avant publication.</p>
    </form>
  )
}
