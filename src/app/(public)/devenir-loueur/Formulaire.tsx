"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, Car } from "lucide-react"
import { deposerDemandeLoueur, type DemandeLoueur } from "./actions"

const TYPES = [
  { v: "particulier", l: "Particulier" },
  { v: "agence", l: "Agence de location" },
  { v: "societe_taxi", l: "Société de taxi" },
  { v: "entreprise", l: "Entreprise" },
]

const champ = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

export default function Formulaire() {
  const [v, setV] = useState<DemandeLoueur>({
    type: "particulier", raison_sociale: "", nom_contact: "", telephone: "",
    email: "", motdepasse: "", ville: "Bouaké", quartier: "",
    nombre_vehicules: "", message: "",
  })
  const [pending, start] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)

  function soumettre(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    start(async () => {
      const r = await deposerDemandeLoueur(v)
      if (!r.ok) { setErreur(r.error); return }
      setEnvoye(true)
    })
  }

  if (envoye) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-green-900">Demande enregistrée</h2>
        <p className="text-sm text-green-800 mt-2 max-w-md mx-auto">
          Votre compte est créé. Un conseiller vérifie votre dossier et vous
          rappelle au <strong>{v.telephone}</strong>. Vous pourrez ajouter vos
          véhicules dès que le compte sera validé.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={soumettre} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{erreur}</p>
      )}

      <label className="block text-xs text-gray-500">
        Vous êtes
        <select className={champ + " mt-1"} value={v.type}
          onChange={e => setV({ ...v, type: e.target.value })}>
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-500">
          Nom et prénoms *
          <input className={champ + " mt-1"} required value={v.nom_contact}
            onChange={e => setV({ ...v, nom_contact: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-500">
          Raison sociale (si société)
          <input className={champ + " mt-1"} value={v.raison_sociale}
            onChange={e => setV({ ...v, raison_sociale: e.target.value })} />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-500">
          Téléphone (WhatsApp de préférence) *
          <input className={champ + " mt-1"} required inputMode="tel" placeholder="07 00 00 00 00"
            value={v.telephone} onChange={e => setV({ ...v, telephone: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-500">
          Adresse e-mail *
          <input className={champ + " mt-1"} required type="email" value={v.email}
            onChange={e => setV({ ...v, email: e.target.value })} />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-500">
          Ville
          <input className={champ + " mt-1"} value={v.ville}
            onChange={e => setV({ ...v, ville: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-500">
          Quartier
          <input className={champ + " mt-1"} value={v.quartier}
            onChange={e => setV({ ...v, quartier: e.target.value })} />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-500">
          Combien de véhicules ?
          <input className={champ + " mt-1"} inputMode="numeric" placeholder="1, 2, 5…"
            value={v.nombre_vehicules} onChange={e => setV({ ...v, nombre_vehicules: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-500">
          Mot de passe *
          <input className={champ + " mt-1"} required type="password" minLength={8}
            placeholder="8 caractères minimum"
            value={v.motdepasse} onChange={e => setV({ ...v, motdepasse: e.target.value })} />
        </label>
      </div>

      <label className="block text-xs text-gray-500">
        Un mot sur vos véhicules (facultatif)
        <textarea rows={3} className={champ + " mt-1"} value={v.message}
          onChange={e => setV({ ...v, message: e.target.value })} />
      </label>

      <button type="submit" disabled={pending}
        className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
        Envoyer ma demande
      </button>

      <p className="text-[11px] text-gray-400 text-center">
        Votre compte est créé immédiatement, mais vos véhicules ne seront visibles
        qu&apos;après vérification de votre dossier par un conseiller.
      </p>
    </form>
  )
}
