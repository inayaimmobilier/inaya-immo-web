"use client"

import { useState, useTransition } from "react"
import { Loader2, CheckCircle2, ShieldCheck, Send, Receipt } from "lucide-react"
import { createLead } from "./actions"
import DateSelect from "./DateSelect"
import { estimateSejour } from "@/lib/residence-pricing"

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR")

export default function ContactForm({ propertyId, initial, isResidence = false, residence }: {
  propertyId: string
  initial?: { nom?: string | null; telephone?: string | null; email?: string | null }
  isResidence?: boolean
  residence?: { prix: number; periode?: string | null; forfaits?: string | null }
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [arrivee, setArrivee] = useState("")
  const [depart, setDepart] = useState("")

  const fmtFr = (iso: string) => iso ? iso.split("-").reverse().join("/") : ""

  // ── Simulation de facture (résidences) ─────────────────────────────────────
  const nuits = arrivee && depart && depart >= arrivee
    ? Math.max(0, Math.round((new Date(depart).getTime() - new Date(arrivee).getTime()) / 86_400_000)) : 0
  const estimate = isResidence && residence && nuits > 0
    ? estimateSejour(nuits, residence.prix || 0, residence.periode ?? "nuit", residence.forfaits ?? null)
    : null

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setErr(null)
    if (isResidence) {
      if (!arrivee) { setErr("Choisissez votre date d'arrivée."); return }
      if (depart && depart < arrivee) { setErr("La date de départ doit être après l'arrivée."); return }
      const sejour = depart ? `Du ${fmtFr(arrivee)} au ${fmtFr(depart)}` : `À partir du ${fmtFr(arrivee)}`
      form.set("creneau", sejour)
      if (estimate) {
        form.set("res_nuits", String(estimate.nuits))
        form.set("res_montant", String(estimate.total))
      }
    }
    startTransition(async () => {
      const res = await createLead(form)
      if (!res.ok) setErr(res.error)
      else setDone(true)
    })
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
        <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-green-800">
          {isResidence ? "Réservation envoyée !" : "Demande envoyée !"}
        </p>
        <p className="text-xs text-green-600 mt-1">
          {isResidence
            ? "Vous allez recevoir une confirmation par WhatsApp. Inaya confirme la disponibilité avec le propriétaire et finalise votre réservation."
            : "Vous allez recevoir un message de confirmation par WhatsApp. Inaya valide le rendez-vous avec le propriétaire et vous recontacte pour organiser la visite."}
        </p>
      </div>
    )
  }

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="property_id" value={propertyId} />
      {isResidence && <input type="hidden" name="est_residence" value="1" />}

      <h3 className="font-semibold text-gray-900 text-sm">
        {isResidence ? "Réserver cette résidence" : "Demander une visite"}
      </h3>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">{err}</div>
      )}

      <input name="contact_nom" placeholder="Votre nom *" required className={field} defaultValue={initial?.nom ?? ""} />
      <input name="contact_telephone" type="tel" placeholder="Téléphone (WhatsApp) *" required className={field} defaultValue={initial?.telephone ?? ""} />
      <input name="contact_email" type="email" placeholder="E-mail (optionnel)" className={field} defaultValue={initial?.email ?? ""} />
      {isResidence ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Date d&apos;arrivée *</label>
            <DateSelect onChange={setArrivee} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Date de départ <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <DateSelect onChange={setDepart} />
          </div>

          {/* Simulation de facture */}
          {estimate && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-teal-800 mb-2">
                <Receipt className="w-4 h-4" /> Estimation du séjour
              </p>
              <div className="flex justify-between text-gray-700">
                <span>Durée</span><strong>{estimate.nuits} nuit{estimate.nuits > 1 ? "s" : ""}</strong>
              </div>
              <div className="flex justify-between text-gray-500 text-xs mt-0.5">
                <span>{estimate.baseNote}</span><span>{fmt(estimate.base)} FCFA</span>
              </div>
              {estimate.forfait && (
                <div className="flex justify-between text-teal-700 text-xs mt-1">
                  <span>✓ {estimate.forfait.note}</span>
                  <span>− {fmt(estimate.base - estimate.total)} FCFA</span>
                </div>
              )}
              <div className="flex justify-between border-t border-teal-200 mt-2 pt-2 font-bold text-teal-900">
                <span>Total estimé</span><span>{fmt(estimate.total)} FCFA</span>
              </div>
              <p className="text-[10px] text-teal-600 mt-1.5">
                Estimation indicative{residence?.forfaits && !estimate.forfait ? " — un forfait spécial peut s'appliquer" : ""}. Montant confirmé par Inaya à la réservation.
              </p>
            </div>
          )}
        </div>
      ) : (
        <input name="creneau" placeholder="Créneau souhaité (ex. samedi matin)" className={field} />
      )}
      <textarea name="message" rows={3}
        placeholder={isResidence ? "Précisez (nombre de personnes, forfait souhaité…)" : "Votre message (optionnel)"}
        className={field} />

      <button
        type="submit"
        disabled={pending}
        className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
          isResidence ? "bg-teal-600 hover:bg-teal-700" : "bg-blue-700 hover:bg-blue-600"
        }`}
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {isResidence ? "Réserver" : "Envoyer ma demande"}
      </button>

      <p className="flex items-start gap-1.5 text-[11px] text-gray-400 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
        {isResidence
          ? "Réservation gérée par Inaya. Les coordonnées du propriétaire restent confidentielles."
          : "Mise en relation assurée par Inaya. Les coordonnées du propriétaire restent confidentielles."}
      </p>
    </form>
  )
}
