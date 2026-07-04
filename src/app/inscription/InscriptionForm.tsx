"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function InscriptionForm() {
  const router = useRouter()
  const [nom, setNom] = useState("")
  const [telephone, setTelephone] = useState("")
  const [commune, setCommune] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    if (password.length < 6) {
      setError("Le mot de passe doit comporter au moins 6 caractères.")
      setLoading(false); return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nom, telephone, commune } },
    })

    if (error) {
      setError(error.message.includes("already") ? "Un compte existe déjà avec cet email." : "Échec de l'inscription. Réessayez.")
      setLoading(false); return
    }

    // Si confirmation email désactivée, une session est créée directement.
    if (data.session) {
      router.push("/client/mes-requetes")
      router.refresh()
    } else {
      setDone(true); setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900">Compte créé</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.
          </p>
          <Link href="/connexion" className="inline-block mt-4 text-sm text-blue-700 font-medium hover:text-blue-800">
            Aller à la connexion →
          </Link>
        </div>
      </div>
    )
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-12 h-12 rounded-2xl mb-3" />
          <h1 className="text-xl font-bold">
            <span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Créez votre compte</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          <input value={nom} onChange={e => setNom(e.target.value)} required placeholder="Nom complet" className={field} />
          <input value={telephone} onChange={e => setTelephone(e.target.value)} type="tel" required placeholder="Téléphone (WhatsApp)" className={field} />
          <input value={commune} onChange={e => setCommune(e.target.value)} required placeholder="Commune / ville" className={field} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="Adresse email" className={field} />
          <div className="relative">
            <input value={password} onChange={e => setPassword(e.target.value)} type={showPwd ? "text" : "password"}
              autoComplete="new-password" required placeholder="Mot de passe" className={`${field} pr-10`} />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</> : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          Déjà un compte ? <Link href="/connexion" className="text-blue-700 hover:text-blue-800 font-medium">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
