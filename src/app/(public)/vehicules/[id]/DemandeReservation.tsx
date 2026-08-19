"use client"

import { useState, useTransition } from "react"
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react"
import { demanderReservation } from "./actions"

export default function DemandeReservation(
  { vehiculeId, titre, reference }: { vehiculeId: string; titre: string; reference: number | null },
) {
  const [ouvert, setOuvert] = useState(false)
  const [pending, start] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)
  const [refDemande, setRefDemande] = useState<number | null | undefined>(undefined)
  const [f, setF] = useState({
    nom: "", telephone: "", email: "", debut: "", fin: "",
    avec_chauffeur: false, message: "",
  })

  const champ = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  function envoyer(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    start(async () => {
      const r = await demanderReservation({ vehicule_id: vehiculeId, ...f })
      if (!r.ok) { setErreur(r.error); return }
      setRefDemande(r.reference)
    })
  }

  if (refDemande !== undefined) {
    return (
      <div className="border-t border-gray-100 pt-3 text-center space-y-2">
        <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
        <p className="text-sm font-semibold text-green-900">Demande envoyée</p>
        <p className="text-xs text-gray-600">
          Nous vous rappelons au <strong>{f.telephone}</strong> pour confirmer la
          disponibilité de {titre}.
          {refDemande ? <> Votre numéro de suivi : <strong>{refDemande}</strong>.</> : null}
        </p>
      </div>
    )
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)}
        className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2">
        <CalendarCheck className="w-4 h-4" /> Demander ce véhicule
      </button>
    )
  }

  return (
    <form onSubmit={envoyer} className="border-t border-gray-100 pt-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">
        Demande pour {titre}{reference ? ` (réf. ${reference})` : ""}
      </p>
      {erreur && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">{erreur}</p>}

      <input required className={champ} placeholder="Nom et prénoms"
        value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} />
      <input required className={champ} placeholder="Téléphone (WhatsApp)" inputMode="tel"
        value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-500">Départ
          <input required type="date" className={champ + " mt-0.5"}
            value={f.debut} onChange={e => setF({ ...f, debut: e.target.value })} /></label>
        <label className="text-[11px] text-gray-500">Retour
          <input required type="date" className={champ + " mt-0.5"}
            value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
        <input type="checkbox" checked={f.avec_chauffeur}
          onChange={e => setF({ ...f, avec_chauffeur: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300" />
        Avec chauffeur
      </label>
      <textarea rows={2} className={champ} placeholder="Précisions (facultatif)"
        value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />

      <button type="submit" disabled={pending}
        className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
        Envoyer la demande
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        Sans engagement. Nous confirmons la disponibilité par téléphone.
      </p>
    </form>
  )
}
