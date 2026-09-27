"use client"

import { useState, useTransition } from "react"
import { ajouterCompte, remplacerSession, basculerCompte, supprimerCompte } from "./actions"

export interface CompteAffiche {
  id: string
  nom: string
  resume: string
  actif: boolean
  statut: "ok" | "expire" | "bloque"
  derniere_utilisation: string | null
  aujourdhui: number
  utilisations_total: number
  derniere_erreur: string | null
  cree_le: string
}

const STATUT = {
  ok: { label: "Opérationnel", cls: "bg-green-50 text-green-700 border-green-200" },
  expire: { label: "Session expirée", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  bloque: { label: "Bloqué par Facebook", cls: "bg-red-50 text-red-700 border-red-200" },
} as const

const dateHeure = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  : "jamais"

const champ = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-400"

export default function ComptesFacebook({ comptes }: { comptes: CompteAffiche[] }) {
  const [nom, setNom] = useState("")
  const [session, setSession] = useState("")
  const [remplacement, setRemplacement] = useState<{ id: string; session: string } | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [enCours, demarrer] = useTransition()

  const agir = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, succes: string, apres?: () => void) =>
    demarrer(async () => {
      const r = await fn()
      setMessage(r.ok ? { ok: true, texte: succes } : { ok: false, texte: r.error })
      if (r.ok) apres?.()
    })

  const operationnels = comptes.filter(c => c.actif && c.statut === "ok").length

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 text-sm ${operationnels > 0 ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        {operationnels > 0
          ? `${operationnels} compte${operationnels > 1 ? "s" : ""} opérationnel${operationnels > 1 ? "s" : ""} : les imports récupèrent toutes les photos.`
          : "Aucun compte opérationnel : les imports ne récupèrent que la première photo."}
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-2 text-sm ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{message.texte}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {comptes.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Aucun compte enregistré.</p>
        ) : comptes.map(c => (
          <div key={c.id} className="border-b border-gray-100 p-4 last:border-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{c.nom} <span className="font-normal text-gray-400">· {c.resume}</span></p>
                <p className="text-xs text-gray-500">
                  Dernière utilisation : {dateHeure(c.derniere_utilisation)} · aujourd&apos;hui {c.aujourdhui}/40 · total {c.utilisations_total}
                </p>
                {c.derniere_erreur && c.statut !== "ok" && <p className="mt-1 text-xs text-red-600">{c.derniere_erreur}</p>}
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUT[c.statut].cls}`}>{STATUT[c.statut].label}</span>
              {!c.actif && <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">Suspendu</span>}
              <button disabled={enCours} onClick={() => agir(() => basculerCompte(c.id, !c.actif), c.actif ? "Compte suspendu." : "Compte réactivé.")}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                {c.actif ? "Suspendre" : "Réactiver"}
              </button>
              <button disabled={enCours} onClick={() => setRemplacement({ id: c.id, session: "" })}
                className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
                Remplacer la session
              </button>
              <button disabled={enCours} onClick={() => { if (confirm(`Supprimer « ${c.nom} » ?`)) agir(() => supprimerCompte(c.id), "Compte supprimé.") }}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                Supprimer
              </button>
            </div>
            {remplacement?.id === c.id && (
              <div className="mt-3 space-y-2">
                <textarea value={remplacement.session} onChange={e => setRemplacement({ id: c.id, session: e.target.value })}
                  rows={4} className={`${champ} font-mono text-xs`} placeholder="Collez ici la nouvelle session (export JSON Cookie-Editor)…" />
                <div className="flex gap-2">
                  <button disabled={enCours || !remplacement.session.trim()}
                    onClick={() => agir(() => remplacerSession(c.id, remplacement.session), "Session remplacée : le compte est de nouveau opérationnel.", () => setRemplacement(null))}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Enregistrer</button>
                  <button onClick={() => setRemplacement(null)} className="rounded-lg px-4 py-2 text-sm text-gray-600">Annuler</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Ajouter un compte</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>Sur un ordinateur, ouvrez un <b>profil Chrome séparé</b> pour ce compte et connectez-vous à facebook.com.</li>
          <li>Faites-y rejoindre au compte les <b>groupes</b> dont vous importerez les annonces.</li>
          <li>Installez l&apos;extension <b>Cookie-Editor</b>, ouvrez-la sur facebook.com → <b>Export</b> → <b>JSON</b>.</li>
          <li>Collez le résultat ci-dessous. Ne vous <b>déconnectez pas</b> ensuite de ce profil : la déconnexion invalide la session.</li>
        </ol>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom interne (ex. Compte Inaya 1)" className={champ} />
        <textarea value={session} onChange={e => setSession(e.target.value)} rows={5}
          placeholder='[{"name":"c_user","value":"…","domain":".facebook.com"}, …]' className={`${champ} font-mono text-xs`} />
        <button disabled={enCours || !nom.trim() || !session.trim()}
          onClick={() => agir(() => ajouterCompte({ nom, session }), "Compte ajouté : il entre dans la rotation.", () => { setNom(""); setSession("") })}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Ajouter le compte
        </button>
        <p className="text-xs text-gray-400">
          La session reste sur le serveur et n&apos;est jamais réaffichée. Aucun mot de passe n&apos;est demandé ni stocké.
        </p>
      </div>
    </div>
  )
}
