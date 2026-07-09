"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { X, Loader2, Heart, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { quickSignup } from "@/lib/account-actions"
import { verificationOptions, sendVerificationCode, confirmVerificationCode } from "@/app/inscription/actions"
import type { OtpCanal } from "@/lib/otp"

const CANAL_LABEL: Record<OtpCanal, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "e-mail" }

/**
 * Modal de création de compte rapide affiché quand un visiteur non connecté
 * tente une action nécessitant un compte (ex: sauvegarder une annonce).
 * Champs : nom, téléphone, commune, mot de passe (+ e-mail optionnel).
 * Suivi d'une étape de vérification (code OTP) — même flux que /inscription.
 */
export default function QuickSignupModal({
  open, onClose, onSuccess, redirectTo,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  redirectTo: string
}) {
  const router = useRouter()
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Étape de vérification (après création du compte).
  const [step, setStep] = useState<"form" | "verify">("form")
  const [canaux, setCanaux] = useState<OtpCanal[]>([])
  const [chosenCanal, setChosenCanal] = useState<OtpCanal | null>(null)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [info, setInfo] = useState<string | null>(null)

  if (!open) return null

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await quickSignup({
        nom: String(form.get("nom") || ""),
        telephone: String(form.get("telephone") || ""),
        commune: String(form.get("commune") || ""),
        password: String(form.get("password") || ""),
        email: String(form.get("email") || "") || null,
      })
      if (!res.ok) { setError(res.error); return }

      const opts = await verificationOptions()
      if (opts.canaux.length === 0) {
        // Aucun canal disponible : on ne bloque pas l'utilisateur.
        router.refresh()
        onSuccess()
        return
      }
      setCanaux(opts.canaux)
      setChosenCanal(opts.canaux[0])
      setStep("verify")
    })
  }

  function sendCode() {
    if (!chosenCanal) return
    setError(null); setInfo(null)
    startTransition(async () => {
      const res = await sendVerificationCode(chosenCanal)
      if (!res.ok) { setError(res.error); return }
      setSent(true)
      setInfo(`Code envoyé par ${CANAL_LABEL[chosenCanal]}.`)
    })
  }

  function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await confirmVerificationCode(code)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
      onSuccess()
    })
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>

        {step === "form" ? (
          <>
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-11 h-11 bg-red-50 rounded-2xl mb-2">
                <Heart className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Créez votre compte</h2>
              <p className="text-xs text-gray-500 mt-1">
                Pour sauvegarder vos annonces et être recontacté. Rapide : juste l&apos;essentiel.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>
            )}

            <form onSubmit={onSubmit} className="space-y-3">
              <input name="nom" required placeholder="Nom complet *" className={field} />
              <input name="telephone" type="tel" required placeholder="Téléphone (WhatsApp) *" className={field} />
              <input name="commune" required placeholder="Commune / ville *" className={field} />
              <input name="email" type="email" placeholder="E-mail (optionnel)" className={field} />
              <div className="relative">
                <input name="password" type={showPwd ? "text" : "password"} required minLength={6}
                  autoComplete="new-password" placeholder="Mot de passe (6 caractères min.) *" className={`${field} pr-10`} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button type="submit" disabled={pending}
                className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
                {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</> : "Créer mon compte et sauvegarder"}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-4">
              Déjà un compte ?{" "}
              <Link href={`/connexion?redirect=${encodeURIComponent(redirectTo)}`} className="text-blue-700 hover:text-blue-800 font-medium">
                Se connecter
              </Link>
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <ShieldCheck className="w-5 h-5" />
              <p className="text-sm font-semibold text-gray-800">Compte créé — vérifions que c&apos;est bien vous.</p>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2">{error}</div>}
            {info && <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-3 py-2">{info}</div>}

            <div className="flex flex-wrap gap-2">
              {canaux.map(c => (
                <button key={c} type="button" onClick={() => { setChosenCanal(c); setSent(false); setInfo(null) }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    chosenCanal === c ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"
                  }`}>
                  {CANAL_LABEL[c]}
                </button>
              ))}
            </div>

            {!sent ? (
              <button onClick={sendCode} disabled={pending || !chosenCanal}
                className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
                {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</> : "Envoyer le code"}
              </button>
            ) : (
              <form onSubmit={verify} className="space-y-3">
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric" autoFocus placeholder="Code à 6 chiffres"
                  className={`${field} text-center tracking-[0.5em] text-lg font-semibold`} />
                <button type="submit" disabled={pending || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">
                  {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Vérification…</> : "Vérifier"}
                </button>
                <button type="button" onClick={sendCode} disabled={pending} className="w-full text-xs text-gray-500 hover:text-blue-700">
                  Renvoyer le code
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
