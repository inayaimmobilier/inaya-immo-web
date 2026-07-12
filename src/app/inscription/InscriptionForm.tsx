"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Eye, EyeOff, Search, Home, Wrench, Handshake, ShieldCheck, ArrowLeft, Briefcase } from "lucide-react"
import Link from "next/link"
import {
  registerAccount, verificationOptions, sendVerificationCode, confirmVerificationCode,
  type AccountType,
} from "./actions"
import type { OtpCanal } from "@/lib/otp"
import { COUNTRIES, DEFAULT_COUNTRY, flagEmoji, type Country } from "@/lib/countries"

const TYPES: { value: AccountType; label: string; desc: string; Icon: typeof Home }[] = [
  { value: "chercheur",    label: "Je cherche un bien", desc: "Louer ou acheter",          Icon: Search },
  { value: "proprietaire", label: "Je suis propriétaire", desc: "Diffuser ou confier mes biens", Icon: Home },
  { value: "prestataire",  label: "Je suis prestataire", desc: "Plomberie, électricité…",  Icon: Wrench },
  { value: "apporteur",    label: "Je suis apporteur",   desc: "Apporter des affaires",     Icon: Handshake },
  { value: "agent",        label: "Je suis agent immobilier", desc: "Candidature — validation admin", Icon: Briefcase },
]

// Destination après inscription, déduite du type choisi (connue côté client,
// évite un aller-retour serveur superflu). Reflète pathForRole() côté serveur
// pour les rôles réellement attribuables à l'inscription (jamais staff/admin).
const REDIRECT_FOR: Record<AccountType, string> = {
  chercheur: "/client/mes-requetes",
  proprietaire: "/proprietaire",
  prestataire: "/prestataire",
  apporteur: "/apporteur",
  agent: "/client/mes-requetes", // candidature : rôle reste "client" tant qu'elle n'est pas approuvée
}

const CANAL_META: Record<OtpCanal, { label: string; hint: (d: string | null) => string }> = {
  whatsapp: { label: "WhatsApp", hint: d => `Sur ${d ?? "votre numéro"}` },
  sms:      { label: "SMS",      hint: d => `Sur ${d ?? "votre numéro"}` },
  email:    { label: "E-mail",   hint: d => `Sur ${d ?? "votre adresse"}` },
}

const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

export default function InscriptionForm() {
  const router = useRouter()

  // Étape courante
  const [step, setStep] = useState<"form" | "verify">("form")

  // Champs du formulaire
  const [type, setType] = useState<AccountType>("chercheur")
  const [proprietaireType, setProprietaireType] = useState<"diffuseur" | "gere">("diffuseur")
  const [metier, setMetier] = useState("")
  const [agence, setAgence] = useState("")
  const [candidatureMessage, setCandidatureMessage] = useState("")
  const [nom, setNom] = useState("")
  const [telephone, setTelephone] = useState("")
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  const [commune, setCommune] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [showPwd, setShowPwd] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Id renvoyé après une création réussie, DANS CETTE MÊME PAGE : seule preuve
  // acceptée par le serveur pour mettre à jour (plutôt que recréer) le compte
  // en cas de retour arrière + correction (cf. registerAccount).
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  // Vérification
  const [canaux, setCanaux] = useState<OtpCanal[]>([])
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null)
  const [emailMasked, setEmailMasked] = useState<string | null>(null)
  const [chosenCanal, setChosenCanal] = useState<OtpCanal | null>(null)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [info, setInfo] = useState<string | null>(null)
  const [agentApplied, setAgentApplied] = useState(false)
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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    if (password.length < 6) { setError("Le mot de passe doit comporter au moins 6 caractères."); setLoading(false); return }
    if (password !== passwordConfirm) { setError("Les deux mots de passe ne correspondent pas."); setLoading(false); return }

    // Numéro complet = indicatif pays + numéro local saisi (sans son indicatif).
    const localDigits = telephone.replace(/\D/g, "")
    if (localDigits.length < 6) { setError("Numéro de téléphone invalide."); setLoading(false); return }
    const fullPhone = `${country.dial}${localDigits}`

    try {
      const res = await registerAccount({
        type, nom, telephone: fullPhone, commune, password,
        passwordConfirm,
        email: email.trim() || null,
        proprietaireType: type === "proprietaire" ? proprietaireType : null,
        metier: type === "prestataire" ? metier : null,
        agence: type === "agent" ? agence : null,
        message: type === "agent" ? candidatureMessage : null,
        pendingUserId,
      })
      if (!res.ok) { setError(res.error); setLoading(false); return }
      setPendingUserId(res.userId)

      const opts = await verificationOptions()
      setCanaux(opts.canaux)
      setPhoneMasked(opts.phoneMasked)
      setEmailMasked(opts.emailMasked)
      setChosenCanal(opts.canaux[0] ?? null)
      setStep("verify")
      setLoading(false)
    } catch {
      setError("Inscription impossible. Vérifiez votre réseau et réessayez.")
      setLoading(false)
    }
  }

  function destFor(canal: OtpCanal | null): string | null {
    if (!canal) return null
    return canal === "email" ? emailMasked : phoneMasked
  }

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
    } catch {
      setError("Envoi impossible. Réessayez."); setLoading(false)
    }
  }

  function goToSpace() {
    router.push(REDIRECT_FOR[type])
    router.refresh()
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await confirmVerificationCode(code)
      setLoading(false)
      if (!res.ok) { setError(res.error); return }
      if (type === "agent") { setAgentApplied(true); return }
      goToSpace()
    } catch {
      setError("Vérification impossible. Réessayez."); setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block group" aria-label="Retour à l'accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-12 h-12 rounded-2xl mb-3 transition-transform group-hover:scale-105" />
            <h1 className="text-xl font-bold">
              <span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span>
            </h1>
          </Link>
          <p className="text-sm text-gray-500 mt-1">
            {step === "form" ? "Créez votre compte" : "Vérifiez votre compte"}
          </p>
        </div>

        {step === "form" ? (
          <form onSubmit={handleRegister} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

            {/* Type de compte */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Vous êtes…</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map(({ value, label, desc, Icon }) => {
                  const active = type === value
                  return (
                    <button type="button" key={value} onClick={() => setType(value)}
                      className={`text-left p-3 rounded-xl border transition-colors ${value === "agent" ? "col-span-2" : ""} ${
                        active ? "border-blue-500 bg-blue-50 ring-1 ring-blue-100" : "border-gray-200 hover:border-blue-300 bg-white"
                      }`}>
                      <Icon className={`w-5 h-5 mb-1 ${active ? "text-blue-600" : "text-gray-400"}`} />
                      <span className="block text-xs font-semibold text-gray-800 leading-tight">{label}</span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">{desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Propriétaire : diffuseur / géré */}
            {type === "proprietaire" && (
              <div className="grid grid-cols-2 gap-2">
                {([["diffuseur", "Je diffuse moi-même"], ["gere", "Inaya gère mes biens"]] as const).map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setProprietaireType(v)}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      proprietaireType === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-blue-300"
                    }`}>{l}</button>
                ))}
              </div>
            )}

            {/* Prestataire : métier */}
            {type === "prestataire" && (
              <input value={metier} onChange={e => setMetier(e.target.value)} required
                placeholder="Votre métier (plomberie, électricité, peinture…)" className={field} />
            )}

            {/* Agent : candidature — nom d'agence + message, validation admin requise */}
            {type === "agent" && (
              <div className="space-y-2">
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-blue-800">
                    Votre compte sera créé immédiatement (accès chercheur), et votre candidature transmise à
                    notre équipe. L&apos;accès agent est activé après validation.
                  </p>
                </div>
                <input value={agence} onChange={e => setAgence(e.target.value)}
                  placeholder="Nom de votre agence (facultatif)" className={field} />
                <textarea value={candidatureMessage} onChange={e => setCandidatureMessage(e.target.value)} rows={3}
                  placeholder="Votre expérience, zone d'activité… (facultatif)" className={`${field} resize-none`} maxLength={500} />
              </div>
            )}

            <input value={nom} onChange={e => setNom(e.target.value)} required placeholder="Nom complet" className={field} />
            {/* Téléphone : indicatif pays (Côte d'Ivoire en tête) + numéro local */}
            <div className="flex gap-2">
              <select value={country.iso} onChange={e => {
                const next = COUNTRIES.find(c => c.iso === e.target.value)
                if (next) setCountry(next)
              }}
                aria-label="Indicatif pays"
                className={`${field} flex-shrink-0 w-[38%] cursor-pointer`}>
                {COUNTRIES.map(c => (
                  <option key={`${c.iso}-${c.name}`} value={c.iso}>
                    {flagEmoji(c.iso)} {c.dial} {c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name}
                  </option>
                ))}
              </select>
              <input value={telephone} onChange={e => setTelephone(e.target.value)} type="tel" required
                placeholder="Numéro WhatsApp" className={`${field} flex-1`} />
            </div>
            <input value={commune} onChange={e => setCommune(e.target.value)} required placeholder="Commune / ville" className={field} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email"
              placeholder="Adresse email (facultatif)" className={field} />
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)} type={showPwd ? "text" : "password"}
                autoComplete="new-password" required placeholder="Mot de passe" className={`${field} pr-10`} />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <input value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} type={showPwd ? "text" : "password"}
                autoComplete="new-password" required placeholder="Confirmer le mot de passe" className={`${field} pr-10`} />
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
        ) : agentApplied ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <Briefcase className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Candidature transmise !</p>
              <p className="text-sm text-gray-500 mt-1">
                Votre compte est vérifié. Notre équipe examine votre candidature d&apos;agent et vous
                notifiera dès qu&apos;elle sera validée. En attendant, vous pouvez utiliser votre espace chercheur.
              </p>
            </div>
            <button onClick={goToSpace}
              className="w-full bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors">
              Accéder à mon espace →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <ShieldCheck className="w-5 h-5" />
              <p className="text-sm font-semibold text-gray-800">Compte créé — vérifions que c&apos;est bien vous.</p>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
            {info && <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3">{info}</div>}

            {canaux.length === 0 ? (
              <p className="text-sm text-gray-500">
                Aucun canal de vérification n&apos;est disponible pour le moment. Vous pouvez continuer et vérifier plus tard.
                <button onClick={() => { if (type === "agent") setAgentApplied(true); else void goToSpace() }}
                  className="block mt-3 text-blue-700 font-medium">Continuer →</button>
              </p>
            ) : (
              <>
                {/* Choix du canal */}
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

            <button onClick={() => { setStep("form"); setError(null); setInfo(null); setSent(false) }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-3 h-3" /> Modifier mes informations
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Déjà un compte ? <Link href="/connexion" className="text-blue-700 hover:text-blue-800 font-medium">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
