"use client"

import { useState, useTransition } from "react"
import { RotateCw, Trash2, Pencil, CheckSquare, Square, X } from "lucide-react"
import { relancerMessagesAction, supprimerMessagesAction, modifierMessageAction } from "./actions"

export interface MessageBloque {
  id: string
  contenu: string | null
  sender_name: string | null
  groupe: string
  recu_le: string
  tentatives: number
  erreur_traitement: string | null
  en_traitement: boolean | null
}

/**
 * File des messages NON INGÉRÉS, avec sélection multiple.
 *
 * Un message bloqué est une annonce qui n'existera jamais. On peut donc :
 * les relancer en lot, corriger le texte d'un message mal recopié avant de le
 * relancer, ou supprimer ce qui n'a rien à faire là (publicités, doublons).
 *
 * La suppression est réservée aux administrateurs et prévenue : elle efface le
 * texte d'origine, donc la possibilité de retrouver l'annonce dans WhatsApp.
 */
export default function FileIngestion({
  messages, peutSupprimer,
}: { messages: MessageBloque[]; peutSupprimer: boolean }) {
  const [choisis, setChoisis] = useState<Set<string>>(new Set())
  const [enEdition, setEnEdition] = useState<MessageBloque | null>(null)
  const [texte, setTexte] = useState("")
  const [info, setInfo] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  if (messages.length === 0) return null

  const tousChoisis = choisis.size === messages.length
  const basculer = (id: string) => setChoisis(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  function relancer() {
    const ids = [...choisis]
    demarrer(async () => {
      setErreur(null); setInfo(null)
      const r = await relancerMessagesAction(ids)
      if (!r.ok) { setErreur(r.erreur ?? "Échec."); return }
      setChoisis(new Set())
      setInfo(`${r.traites} message(s) remis en file${r.ignores ? ` — ${r.ignores} déjà traité(s), ignoré(s)` : ""}. Le service les reprend dans la minute.`)
    })
  }

  function supprimer() {
    const ids = [...choisis]
    if (!confirm(`Supprimer ${ids.length} message(s) ? Le texte d'origine sera perdu : on ne pourra plus retrouver ces annonces dans WhatsApp.`)) return
    demarrer(async () => {
      setErreur(null); setInfo(null)
      const r = await supprimerMessagesAction(ids)
      if (!r.ok) { setErreur(r.erreur ?? "Échec."); return }
      setChoisis(new Set())
      setInfo(`${r.traites} message(s) supprimé(s).`)
    })
  }

  function enregistrerTexte() {
    if (!enEdition) return
    demarrer(async () => {
      setErreur(null); setInfo(null)
      const r = await modifierMessageAction(enEdition.id, texte)
      if (!r.ok) { setErreur(r.erreur ?? "Échec."); return }
      setEnEdition(null)
      setInfo("Texte corrigé et message remis en file.")
    })
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900">
          À ré-ingérer <span className="text-gray-400 font-normal">({messages.length})</span>
        </h2>

        <button type="button" onClick={() => setChoisis(tousChoisis ? new Set() : new Set(messages.map(m => m.id)))}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">
          {tousChoisis ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {tousChoisis ? "Tout désélectionner" : "Tout sélectionner"}
        </button>

        <div className="flex-1" />

        <button type="button" disabled={!choisis.size || enCours} onClick={relancer}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
          <RotateCw className="w-3.5 h-3.5" /> Relancer ({choisis.size})
        </button>
        {peutSupprimer && (
          <button type="button" disabled={!choisis.size || enCours} onClick={supprimer}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-700 border border-red-100 px-3 py-1.5 rounded-lg">
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        )}
      </div>

      {info && <p className="px-5 py-2.5 text-xs font-medium text-green-700 bg-green-50">{info}</p>}
      {erreur && <p className="px-5 py-2.5 text-xs font-medium text-red-700 bg-red-50">{erreur}</p>}

      <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
        {messages.map(m => {
          const choisi = choisis.has(m.id)
          const echec = (m.tentatives ?? 0) >= 3
          return (
            <li key={m.id} className={`px-5 py-3 flex items-start gap-3 ${choisi ? "bg-blue-50/40" : ""}`}>
              <button type="button" onClick={() => basculer(m.id)} className="mt-0.5 shrink-0" aria-label="Sélectionner">
                {choisi ? <CheckSquare className="w-4 h-4 text-blue-700" /> : <Square className="w-4 h-4 text-gray-300" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-blue-700">{m.groupe}</span>
                  {m.sender_name && <span className="text-xs text-gray-500">{m.sender_name}</span>}
                  <span className="text-[11px] text-gray-400">
                    {new Date(m.recu_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {echec && (
                    <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                      en échec ({m.tentatives} tentatives)
                    </span>
                  )}
                  {m.en_traitement && (
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">en cours</span>
                  )}
                </div>
                <p className="text-[13px] text-gray-700 mt-1 whitespace-pre-line line-clamp-4">
                  {m.contenu ?? "(message sans texte)"}
                </p>
                {m.erreur_traitement && (
                  <p className="text-[11px] text-red-600 mt-1">⚠ {m.erreur_traitement}</p>
                )}
              </div>

              <button type="button" onClick={() => { setEnEdition(m); setTexte(m.contenu ?? "") }}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-blue-700 border border-gray-200 px-2 py-1 rounded-lg">
                <Pencil className="w-3 h-3" /> Corriger
              </button>
            </li>
          )
        })}
      </ul>

      {/* Correction du texte, puis remise en file */}
      {enEdition && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Corriger le message</h3>
              <button type="button" onClick={() => setEnEdition(null)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={10}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-400" />
            <p className="text-xs text-gray-500">
              Le message sera remis en file après correction. La provenance — groupe, publieur, heure — est conservée.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEnEdition(null)}
                className="px-3 py-2 text-sm text-gray-600">Annuler</button>
              <button type="button" disabled={enCours} onClick={enregistrerTexte}
                className="px-4 py-2 text-sm font-semibold bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl">
                Corriger et relancer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
