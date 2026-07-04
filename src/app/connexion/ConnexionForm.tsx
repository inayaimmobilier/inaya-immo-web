"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { signInFlexible, postLoginPath } from "@/lib/account-actions"

export default function ConnexionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const explicitRedirect = searchParams.get("redirect")

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await signInFlexible(identifier, password)
      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }

      // Redirection explicite si fournie, sinon selon le rôle du compte.
      const target = explicitRedirect || (await postLoginPath())
      router.push(target)
      router.refresh()
    } catch {
      // Ex. domaine apex injoignable / requête interrompue : on évite le spinner bloqué à vie.
      setError("Connexion impossible. Vérifiez votre réseau et utilisez l'adresse https://www.inaya.ci")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-12 h-12 rounded-2xl mb-3" />
          <h1 className="text-xl font-bold">
            <span className="text-blue-700">Inaya</span>
            <span className="text-amber-500"> Immo</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Connectez-vous à votre espace</p>
        </div>

        {/* Formulaire */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700" htmlFor="identifier">
              Téléphone ou adresse email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              placeholder="0708090910 ou admin@inaya.ci"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700" htmlFor="password">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Connexion…</>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="text-blue-700 hover:text-blue-800 font-medium">Créer un compte</Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link href="/" className="hover:text-gray-600 transition-colors">← Retour au site</Link>
        </p>
      </div>
    </div>
  )
}
