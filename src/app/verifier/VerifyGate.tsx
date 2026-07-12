"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react"
import { verificationOptions, sendVerificationCode, confirmVerificationCode } from "@/app/inscription/actions"
import type { OtpCanal } from "@/lib/otp"

const CANAL_META: Record<OtpCanal, { label: string; hint: (d: string | null) => string }> = {
  whatsapp: { label: "WhatsApp", hint: d => `Sur ${d ?? "votre numéro"}` },
  sms:      { label: "SMS",      hint: d => `Sur ${d ?? "votre numéro"}` },
  email:    { label: "E-mail",   hint: d => `Sur ${d ?? "votre adresse"}` },
}
const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

export default function VerifyGate({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [canaux, setCanaux] = useState<OtpCanal[]>([])
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null)
  const [emailMasked, setEmailMasked] = useState<string | null>(null)
  const [chosenCanal, setChosenCanal] = useState<OtpCanal | null>(null)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Cooldown de renvoi (60 s) anti-spam : empêche les clics répétés sur
  // « Renvoyer le code » qui empilaient des notifications OTP en base.
  const RESEND_COOLDOWN_S = 60
  const [resendIn, setResendIn] = useState(0)
  const resendTick = useRef<ReturnType<typeof setInterval> | null>(null)

  const startResendCooldown = useCallback(() => {
    setResendIn(RESEND_COOLDOWN_S)
    if (resendTick.current) clearInterval(resendTick.current)
    resendTick.current = setInterval(() => {
      setResendIn(s => {
        if (s <= 1) {
          if (resendTick.current) clearInterval(resendTick.current)
          resendTick.current = null
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (resendTick.current) clearInterval(resendTick.current) }, [])

  const loadOptions = useCallback(async () => {
    const opts = await verificationOptions()
    if (opts.verifie) { router.push(redirectTo); router.refresh(); return }
    setCanaux(opts.canaux)
    setPhoneMasked(opts.phoneMasked)
    setEmailMasked(opts.emailMasked)
    setChosenCanal(opts.canaux[0] ?? null)
  }, [router, redirectTo])

  // Chargement initial des canaux OTP (les setState surviennent APRÈS await,
  // pas de cascade synchrone — cf. même idiome que WaDiagnostic).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOptions() }, [loadOptions])

  const destFor = (canal: OtpCanal | null) =>
    !canal ? null : canal === "email" ? emailMasked : phoneMasked

  async function handleSend() {
    if (!chosenCanal) return
    setLoading(true); setError(null); setInfo(null)
    try {
      const res = await sendVerificationCode(chosenCanal)
      if (!res.ok) { setError(res.error); setLoading(false); return }
      setSent(true)
      setInfo(`Code envoyé par ${CANAL_META[chosenCanal].label}. Saisissez-le ci-dessous.`)
      startResendCooldown()
      setLoading(false)
    } catch { setError("Envoi impossible. Réessayez."); setLoading(false) }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await confirmVerificationCode(code)
      setLoading(false)
      if (!res.ok) { setError(res.error); return }
      router.push(redirectTo); router.refresh()
    } catch { setError("Vérification impossible. Réessayez."); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block group" aria-label="Retour à l'accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-12 h-12 rounded-2xl mb-3" />
            <h1 className="text-xl font-bold">
              <span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span>
            </h1>
          </Link>
          <p className="text-sm text-gray-500 mt-1">Vérifiez votre compte pour continuer</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-blue-700">
            <ShieldCheck className="w-5 h-5" />
            <p className="text-sm font-semibold text-gray-800">Une vérification est requise avant l&apos;accès.</p>
          </div>

          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
          {info && <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3">{info}</div>}

          {canaux.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucun canal de vérification n&apos;est disponible pour le moment (numéro ou e-mail manquant).
              Contactez le support, ou modifiez vos informations depuis la page d&apos;inscription.
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Recevoir le code par :</label>
                <div className="space-y-2">
                  {canaux.map(c => {
                    const active = chosenCanal === c
                    return (
                      <button type="button" key={c} onClick={() => { setChosenCanal(c); setSent(false); setInfo(null) }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                          active ? "border-blue-500 bg-blue-50 ring-1 ring-blue-100" : "border-gray-200 hover:border-blue-300"
                        }`}>
                        <span>
                          <span className="block text-sm font-semibold text-gray-800">{CANAL_META[c].label}</span>
                          <span className="block text-[11px] text-gray-400">{CANAL_META[c].hint(destFor(c))}</span>
                        </span>
                        <span className={`w-4 h-4 rounded-full border-2 ${active ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {!sent ? (
                <button onClick={handleSend} disabled={loading || !chosenCanal}
                  className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</> : "Envoyer le code"}
                </button>
              ) : (
                <form onSubmit={handleVerify} className="space-y-3">
                  <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric" autoFocus placeholder="Code à 6 chiffres"
                    className={`${field} text-center tracking-[0.5em] text-lg font-semibold`} />
                  <button type="submit" disabled={loading || code.length !== 6}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Vérification…</> : "Vérifier"}
                  </button>
                  <button type="button" onClick={handleSend} disabled={loading || resendIn > 0}
                    className="w-full text-xs text-gray-500 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {resendIn > 0 ? `Renvoyer dans ${resendIn}s` : "Renvoyer le code"}
                  </button>
                </form>
              )}
            </>
          )}

          <form action="/api/auth/signout" method="post">
            <button type="submit" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-3 h-3" /> Me déconnecter
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
