"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Pencil, Trash2, Loader2, X, Check, Search, KeyRound,
  Car, Phone, ShieldCheck, PauseCircle, XCircle,
} from "lucide-react"
import {
  creerLoueur, majLoueur, changerStatutLoueur, supprimerLoueur, ouvrirAcces,
  type LoueurInput,
} from "./actions"

export interface Loueur {
  id: string
  type: string
  raison_sociale: string | null
  nom_contact: string | null
  telephone: string
  telephone_2: string | null
  email: string | null
  adresse: string | null
  ville: string | null
  quartier: string | null
  numero_identification: string | null
  commission_pourcent: number
  contrat_debut: string | null
  contrat_fin: string | null
  paiement_mode: string | null
  paiement_details: string | null
  statut: string
  motif_refus: string | null
  notes_internes: string | null
  profile_id: string | null
  created_at: string
}

const TYPES: { v: string; l: string }[] = [
  { v: "particulier", l: "Particulier" },
  { v: "agence", l: "Agence de location" },
  { v: "societe_taxi", l: "Société de taxi" },
  { v: "entreprise", l: "Entreprise" },
]

const STATUTS: Record<string, { l: string; cls: string }> = {
  en_attente: { l: "En attente", cls: "bg-amber-50 text-amber-700" },
  actif: { l: "Actif", cls: "bg-green-50 text-green-700" },
  suspendu: { l: "Suspendu", cls: "bg-gray-100 text-gray-600" },
  refuse: { l: "Refusé", cls: "bg-red-50 text-red-700" },
}

const vide: LoueurInput = {
  type: "particulier", raison_sociale: "", nom_contact: "", telephone: "",
  telephone_2: "", email: "", adresse: "", ville: "", quartier: "",
  numero_identification: "", commission_pourcent: 0, contrat_debut: "",
  contrat_fin: "", paiement_mode: "", paiement_details: "", notes_internes: "",
  motdepasse: "",
}

const champ = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

function nomDe(l: Loueur): string {
  return l.raison_sociale || l.nom_contact || "Sans nom"
}

export default function LoueursManager(
  { loueurs, flotte }: { loueurs: Loueur[]; flotte: Record<string, number> },
) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState("")
  const [filtre, setFiltre] = useState<string>("tous")

  const [edition, setEdition] = useState<{ id: string | null; v: LoueurInput } | null>(null)
  const [confirmSupp, setConfirmSupp] = useState<string | null>(null)
  const [acces, setAcces] = useState<{ id: string; email: string; mdp: string } | null>(null)

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return loueurs.filter(l => {
      if (filtre !== "tous" && l.statut !== filtre) return false
      if (!q) return true
      return [nomDe(l), l.telephone, l.email ?? "", l.ville ?? ""]
        .some(x => x.toLowerCase().includes(q))
    })
  }, [loueurs, recherche, filtre])

  function ouvrirNouveau() {
    setErreur(null)
    setEdition({ id: null, v: { ...vide } })
  }

  function ouvrirEdition(l: Loueur) {
    setErreur(null)
    setEdition({
      id: l.id,
      v: {
        type: l.type, raison_sociale: l.raison_sociale ?? "", nom_contact: l.nom_contact ?? "",
        telephone: l.telephone, telephone_2: l.telephone_2 ?? "", email: l.email ?? "",
        adresse: l.adresse ?? "", ville: l.ville ?? "", quartier: l.quartier ?? "",
        numero_identification: l.numero_identification ?? "",
        commission_pourcent: l.commission_pourcent, contrat_debut: l.contrat_debut ?? "",
        contrat_fin: l.contrat_fin ?? "", paiement_mode: l.paiement_mode ?? "",
        paiement_details: l.paiement_details ?? "", notes_internes: l.notes_internes ?? "",
        motdepasse: "",
      },
    })
  }

  function enregistrer() {
    if (!edition) return
    setErreur(null)
    start(async () => {
      const r = edition.id
        ? await majLoueur(edition.id, edition.v)
        : await creerLoueur(edition.v)
      if (!r.ok) { setErreur(r.error); return }
      setEdition(null)
      router.refresh()
    })
  }

  function statut(id: string, s: string) {
    setErreur(null)
    // Un refus sans motif n'apprend rien au demandeur : on le réclame ici
    // plutôt que de laisser le serveur renvoyer une erreur sèche.
    const motif = s === "refuse"
      ? (window.prompt("Motif du refus (communiqué au demandeur) :") ?? "").trim()
      : undefined
    if (s === "refuse" && !motif) return
    start(async () => {
      const r = await changerStatutLoueur(id, s, motif)
      if (!r.ok) { setErreur(r.error); return }
      router.refresh()
    })
  }

  function supprimer(id: string) {
    setErreur(null)
    start(async () => {
      const r = await supprimerLoueur(id)
      if (!r.ok) { setErreur(r.error); setConfirmSupp(null); return }
      setConfirmSupp(null)
      router.refresh()
    })
  }

  function creerAcces() {
    if (!acces) return
    setErreur(null)
    start(async () => {
      const r = await ouvrirAcces(acces.id, acces.email, acces.mdp)
      if (!r.ok) { setErreur(r.error); return }
      setAcces(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Nom, téléphone, ville…"
              className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 w-64"
            />
          </div>
          {["tous", "en_attente", "actif", "suspendu", "refuse"].map(s => (
            <button key={s} onClick={() => setFiltre(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                filtre === s ? "bg-blue-600 text-white border-blue-600"
                             : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {s === "tous" ? "Tous" : STATUTS[s].l}
            </button>
          ))}
        </div>
        <button onClick={ouvrirNouveau}
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Nouveau loueur
        </button>
      </div>

      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{erreur}</p>
      )}

      {liste.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-2xl p-6 text-center">
          Aucun loueur {filtre !== "tous" ? `avec le statut « ${STATUTS[filtre].l} »` : ""}.
        </p>
      ) : (
        <div className="space-y-2">
          {liste.map(l => {
            const st = STATUTS[l.statut] ?? STATUTS.en_attente
            const nb = flotte[l.id] ?? 0
            return (
              <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{nomDe(l)}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${st.cls}`}>{st.l}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">
                        {TYPES.find(t => t.v === l.type)?.l ?? l.type}
                      </span>
                      {!l.profile_id && (
                        <span className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500">
                          sans accès en ligne
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {l.telephone}
                      </span>
                      {l.ville && <span>{l.ville}{l.quartier ? ` · ${l.quartier}` : ""}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Car className="w-3 h-3" /> {nb} véhicule{nb > 1 ? "s" : ""}
                      </span>
                      <span>Commission {l.commission_pourcent}%</span>
                    </p>
                    {l.statut === "refuse" && l.motif_refus && (
                      <p className="text-xs text-red-600 mt-1">Motif : {l.motif_refus}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    {l.statut !== "actif" && (
                      <button onClick={() => statut(l.id, "actif")} disabled={pending}
                        title="Activer"
                        className="p-2 rounded-lg text-green-600 hover:bg-green-50">
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                    )}
                    {l.statut === "actif" && (
                      <button onClick={() => statut(l.id, "suspendu")} disabled={pending}
                        title="Suspendre"
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    )}
                    {l.statut === "en_attente" && (
                      <button onClick={() => statut(l.id, "refuse")} disabled={pending}
                        title="Refuser"
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {!l.profile_id && (
                      <button onClick={() => setAcces({ id: l.id, email: l.email ?? "", mdp: "" })}
                        title="Ouvrir un accès en ligne"
                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => ouvrirEdition(l)} title="Modifier"
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setConfirmSupp(l.id)} title="Supprimer"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {confirmSupp === l.id && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-red-800">
                      Supprimer « {nomDe(l)} » ? Son accès en ligne sera supprimé aussi.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmSupp(null)}
                        className="px-3 py-1.5 text-xs text-gray-600">Annuler</button>
                      <button onClick={() => supprimer(l.id)} disabled={pending}
                        className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg">
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Fenêtre d'édition ─────────────────────────────────────────── */}
      {edition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                {edition.id ? "Modifier le loueur" : "Nouveau loueur"}
              </h3>
              <button onClick={() => setEdition(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {erreur && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-3">{erreur}</p>}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">
                  Type
                  <select value={edition.v.type} className={champ + " mt-1"}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, type: e.target.value } })}>
                    {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  Commission (%)
                  <input type="number" min={0} max={100} step={0.5} className={champ + " mt-1"}
                    value={edition.v.commission_pourcent ?? 0}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, commission_pourcent: Number(e.target.value) } })} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">
                  Raison sociale
                  <input className={champ + " mt-1"} value={edition.v.raison_sociale ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, raison_sociale: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  Nom du contact
                  <input className={champ + " mt-1"} value={edition.v.nom_contact ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, nom_contact: e.target.value } })} />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-gray-500">
                  Téléphone *
                  <input className={champ + " mt-1"} value={edition.v.telephone}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, telephone: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  Téléphone 2
                  <input className={champ + " mt-1"} value={edition.v.telephone_2 ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, telephone_2: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  E-mail
                  <input className={champ + " mt-1"} value={edition.v.email ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, email: e.target.value } })} />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-gray-500">
                  Ville
                  <input className={champ + " mt-1"} value={edition.v.ville ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, ville: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  Quartier
                  <input className={champ + " mt-1"} value={edition.v.quartier ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, quartier: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  N° d&apos;identification
                  <input className={champ + " mt-1"} value={edition.v.numero_identification ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, numero_identification: e.target.value } })} />
                </label>
              </div>

              <label className="text-xs text-gray-500 block">
                Adresse
                <input className={champ + " mt-1"} value={edition.v.adresse ?? ""}
                  onChange={e => setEdition({ ...edition, v: { ...edition.v, adresse: e.target.value } })} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">
                  Contrat — début
                  <input type="date" className={champ + " mt-1"} value={edition.v.contrat_debut ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, contrat_debut: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  Contrat — fin
                  <input type="date" className={champ + " mt-1"} value={edition.v.contrat_fin ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, contrat_fin: e.target.value } })} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">
                  Règlement — mode
                  <input className={champ + " mt-1"} placeholder="Mobile Money, virement…"
                    value={edition.v.paiement_mode ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, paiement_mode: e.target.value } })} />
                </label>
                <label className="text-xs text-gray-500">
                  Règlement — détails
                  <input className={champ + " mt-1"} placeholder="Numéro, banque…"
                    value={edition.v.paiement_details ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, paiement_details: e.target.value } })} />
                </label>
              </div>

              <label className="text-xs text-gray-500 block">
                Notes internes (jamais visibles du loueur)
                <textarea rows={2} className={champ + " mt-1"} value={edition.v.notes_internes ?? ""}
                  onChange={e => setEdition({ ...edition, v: { ...edition.v, notes_internes: e.target.value } })} />
              </label>

              {!edition.id && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-blue-900 font-medium">Accès à l&apos;espace loueur (facultatif)</p>
                  <p className="text-[11px] text-blue-800">
                    Renseignez e-mail ET mot de passe pour que le propriétaire puisse gérer
                    ses véhicules lui-même. Laissez vide s&apos;il ne souhaite pas de compte —
                    vous gérerez sa flotte depuis l&apos;administration.
                  </p>
                  <input type="password" className={champ} placeholder="Mot de passe (8 caractères minimum)"
                    value={edition.v.motdepasse ?? ""}
                    onChange={e => setEdition({ ...edition, v: { ...edition.v, motdepasse: e.target.value } })} />
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setEdition(null)} className="px-4 py-2 text-sm text-gray-600">
                Annuler
              </button>
              <button onClick={enregistrer} disabled={pending}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl inline-flex items-center gap-2 disabled:opacity-60">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ouverture d'un accès ──────────────────────────────────────── */}
      {acces && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Ouvrir un accès en ligne</h3>
            <p className="text-xs text-gray-500">
              Le loueur pourra se connecter et gérer ses véhicules. Communiquez-lui
              ces identifiants ; il pourra changer son mot de passe ensuite.
            </p>
            {erreur && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-3">{erreur}</p>}
            <input className={champ} placeholder="E-mail" value={acces.email}
              onChange={e => setAcces({ ...acces, email: e.target.value })} />
            <input className={champ} type="password" placeholder="Mot de passe (8 caractères minimum)"
              value={acces.mdp} onChange={e => setAcces({ ...acces, mdp: e.target.value })} />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAcces(null)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={creerAcces} disabled={pending}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl disabled:opacity-60">
                Créer l&apos;accès
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
