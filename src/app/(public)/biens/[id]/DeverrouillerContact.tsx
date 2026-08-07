"use client"

import { useState, useTransition } from "react"
import { KeyRound, Phone, Loader2, ShieldAlert, Flag } from "lucide-react"
import { deverrouiller, reclamer } from "./unlockActions"

// ============================================================================
// DÉVERROUILLAGE DU CONTACT — carte affichée aux professionnels.
//
// Elle n'apparaît QUE pour un compte professionnel activé : pour tout le monde
// d'autre, la page reste ce qu'elle était. Afficher un service payant à un
// particulier qui cherche un logement ne ferait que brouiller sa route vers le
// formulaire de visite, qui est gratuit.
//
// Le prix et l'ORIGINE du contact sont annoncés AVANT le paiement. Le second
// point n'est pas un détail : ce qu'on vend est le plus souvent le contact du
// diffuseur de l'annonce, souvent une autre agence, et non celui du
// propriétaire. Le découvrir après avoir payé, c'est perdre un client.
// ============================================================================

export interface EtatDeverrouillage {
  possible: boolean
  raison?: string
  cout: number
  solde: number
  deja: boolean
  source: "proprietaire" | "diffuseur" | null
}

export default function DeverrouillerContact({
  propertyId, etat,
}: { propertyId: string; etat: EtatDeverrouillage }) {
  const [pending, start] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)
  const [contact, setContact] = useState<{ telephone: string; nom: string | null; source: string } | null>(null)
  const [solde, setSolde] = useState(etat.solde)
  const [reclame, setReclame] = useState(false)

  function acheter() {
    setErreur(null)
    start(async () => {
      const r = await deverrouiller(propertyId)
      if (!r.ok) { setErreur(r.error); return }
      setContact({ telephone: r.telephone, nom: r.nom, source: r.source })
      setSolde(r.solde)
    })
  }

  // Contact obtenu : on l'affiche, avec de quoi appeler et de quoi se plaindre.
  if (contact) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
          {contact.source === "proprietaire" ? "Propriétaire" : "Diffuseur de l'annonce"}
        </p>
        <p className="mt-1 text-xl font-bold text-gray-900">{contact.nom || "Contact"}</p>
        <a href={`tel:${contact.telephone}`}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800">
          <Phone className="h-4 w-4" /> {contact.telephone}
        </a>
        <p className="mt-3 text-xs text-green-900">
          Envoyé aussi sur votre WhatsApp. Solde : {solde.toLocaleString("fr-FR")} crédits.
        </p>

        {/* Le recours est proposé ICI, au moment où le professionnel découvre
            que le numéro ne donne rien — et non enterré dans un menu. */}
        {reclame ? (
          <p className="mt-3 text-xs text-gray-600">
            Réclamation transmise. Notre équipe vous répond après vérification.
          </p>
        ) : (
          <form className="mt-4 border-t border-green-200 pt-3"
            action={fd => start(async () => {
              const r = await reclamer(propertyId, String(fd.get("motif") || ""))
              if (r.ok) setReclame(true); else setErreur(r.error)
            })}>
            <input name="motif" required placeholder="Numéro injoignable, bien déjà loué…"
              className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm" />
            <button disabled={pending}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-green-800 hover:underline">
              <Flag className="h-3.5 w-3.5" /> Signaler un problème sur ce contact
            </button>
          </form>
        )}
        {erreur && <p className="mt-2 text-xs text-red-700">{erreur}</p>}
      </div>
    )
  }

  if (!etat.possible) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <ShieldAlert className="h-4 w-4 text-gray-400" /> Mise en relation indisponible
        </p>
        <p className="mt-1 text-xs text-gray-600 leading-relaxed">{etat.raison}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
        <KeyRound className="h-4 w-4" /> Obtenir le contact
      </p>

      <p className="mt-2 text-xs leading-relaxed text-blue-900">
        {etat.source === "proprietaire"
          ? "Vous obtiendrez le contact du propriétaire, vérifié par Inaya."
          : "Vous obtiendrez le contact de la personne qui a diffusé cette annonce. Ce n'est pas nécessairement le propriétaire : il peut s'agir d'un confrère."}
      </p>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {etat.deja ? "Déjà payé" : `${etat.cout.toLocaleString("fr-FR")} crédits`}
          </p>
          <p className="text-[11px] text-blue-800">
            Solde : {solde.toLocaleString("fr-FR")} crédits
          </p>
        </div>
        <button onClick={acheter} disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          {etat.deja ? "Revoir le contact" : "Débloquer"}
        </button>
      </div>

      {!etat.deja && solde < etat.cout && (
        <p className="mt-3 text-xs font-medium text-amber-800">
          Crédit insuffisant. Contactez Inaya pour recharger votre compte.
        </p>
      )}
      {erreur && <p className="mt-3 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}
