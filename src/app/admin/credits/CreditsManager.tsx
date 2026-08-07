"use client"

import { useState, useTransition } from "react"
import { Wallet, Ban, Check, X, RotateCcw, PhoneOff, Loader2, Plus } from "lucide-react"
import {
  crediter, suspendreCompte, ouvrirCompte, reglerTarif,
  retirerDeLaDiffusion, trancherReclamation,
} from "./actions"

// ============================================================================
// PILOTAGE DES CRÉDITS — interface.
//
// Quatre onglets, parce que ces quatre choses se pilotent ensemble mais ne se
// regardent pas en même temps : on recharge un compte, OU on ajuste la grille,
// OU on tranche une réclamation.
// ============================================================================

export interface LigneCompte {
  userId: string; nom: string; contact: string; role: string
  solde: number; suspendu: boolean; achats: number; depense: number; depuis: string
}
export interface LigneTarif {
  id: string; type_offre: string; categorie: string | null; actif: boolean
  taux_commission: number | null; part_pourcent: number
  cout_min: number; cout_max: number | null; cout_defaut: number
}
export interface LigneReclamation {
  id: string; professionnel: string; motif: string; statut: string; note: string | null
  cout: number; telephone: string; source: string; propertyId: string | null; date: string
}
export interface LigneRetrait { telephone: string; motif: string | null; created_at: string }

type Onglet = "comptes" | "tarifs" | "reclamations" | "retraits"

const champ = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
const bouton = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"

export default function CreditsManager({ comptes, tarifs, reclamations, retraits }: {
  comptes: LigneCompte[]; tarifs: LigneTarif[]
  reclamations: LigneReclamation[]; retraits: LigneRetrait[]
}) {
  const [onglet, setOnglet] = useState<Onglet>("comptes")
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [pending, start] = useTransition()

  /** Toutes les actions passent par ici : un seul endroit qui affiche le résultat. */
  const agir = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setMessage(null)
    start(async () => {
      const r = await fn()
      setMessage(r.ok ? { ok: true, texte: r.message ?? "Enregistré." } : { ok: false, texte: r.error })
    })
  }

  const ouvertes = reclamations.filter(r => r.statut === "ouverte").length

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {([
          ["comptes", `Comptes (${comptes.length})`],
          ["tarifs", "Grille tarifaire"],
          ["reclamations", `Réclamations${ouvertes ? ` (${ouvertes})` : ""}`],
          ["retraits", `Numéros retirés (${retraits.length})`],
        ] as [Onglet, string][]).map(([cle, label]) => (
          <button key={cle} onClick={() => setOnglet(cle)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              onglet === cle ? "bg-blue-700 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {message.texte}
        </div>
      )}

      {onglet === "comptes" && <Comptes comptes={comptes} agir={agir} pending={pending} />}
      {onglet === "tarifs" && <Tarifs tarifs={tarifs} agir={agir} pending={pending} />}
      {onglet === "reclamations" && <Reclamations lignes={reclamations} agir={agir} pending={pending} />}
      {onglet === "retraits" && <Retraits lignes={retraits} agir={agir} pending={pending} />}
    </div>
  )
}

type Agir = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => void

// ── COMPTES ────────────────────────────────────────────────────────────────

function Comptes({ comptes, agir, pending }: { comptes: LigneCompte[]; agir: Agir; pending: boolean }) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [nouveau, setNouveau] = useState("")

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Activer un professionnel</h2>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Collez l&apos;identifiant du compte à activer. C&apos;est cette activation qui
          l&apos;autorise à acheter des contacts — vérifiez l&apos;agence avant.
        </p>
        <div className="flex gap-2">
          <input value={nouveau} onChange={e => setNouveau(e.target.value)}
            placeholder="Identifiant du compte (UUID)" className={champ} />
          <button disabled={pending || !nouveau.trim()}
            onClick={() => agir(async () => { const r = await ouvrirCompte(nouveau.trim()); setNouveau(""); return r })}
            className={`${bouton} bg-blue-700 text-white hover:bg-blue-800 whitespace-nowrap`}>
            <Plus className="w-4 h-4" /> Activer
          </button>
        </div>
      </div>

      {comptes.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">Aucun compte professionnel pour le moment.</p>
      ) : comptes.map(c => (
        <div key={c.userId} className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                {c.nom}
                {c.suspendu && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">suspendu</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{c.contact} · {c.role}</p>
              <p className="text-xs text-gray-500 mt-1">
                {c.achats} contact{c.achats > 1 ? "s" : ""} acheté{c.achats > 1 ? "s" : ""} ·
                {" "}{c.depense.toLocaleString("fr-FR")} crédits consommés
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{c.solde.toLocaleString("fr-FR")}</p>
              <p className="text-[11px] text-gray-500">crédits disponibles</p>
            </div>
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            <button onClick={() => setOuvert(ouvert === c.userId ? null : c.userId)}
              className={`${bouton} bg-white border border-gray-200 text-gray-700 hover:border-blue-300`}>
              <Wallet className="w-4 h-4" /> Mouvement
            </button>
            <button disabled={pending}
              onClick={() => agir(() => suspendreCompte(c.userId, !c.suspendu))}
              className={`${bouton} bg-white border border-gray-200 ${c.suspendu ? "text-green-700 hover:border-green-300" : "text-red-600 hover:border-red-300"}`}>
              {c.suspendu ? <><RotateCcw className="w-4 h-4" /> Rétablir</> : <><Ban className="w-4 h-4" /> Suspendre</>}
            </button>
          </div>

          {ouvert === c.userId && (
            <form className="mt-4 pt-4 border-t border-gray-100 space-y-3"
              action={fd => agir(async () => { fd.set("user_id", c.userId); return crediter(fd) })}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Montant en crédits</label>
                  <input name="montant" type="number" required placeholder="10000" className={champ} />
                  <p className="text-[11px] text-gray-500 mt-1">Négatif pour retirer.</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Nature</label>
                  <select name="type" className={champ} defaultValue="recharge_admin">
                    <option value="recharge_admin">Rechargement</option>
                    <option value="remboursement">Remboursement</option>
                    <option value="ajustement">Correction</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Motif (obligatoire)</label>
                <input name="motif" required placeholder="Rechargement Orange Money du 07/08" className={champ} />
                <p className="text-[11px] text-gray-500 mt-1">
                  C&apos;est ce qui justifie le mouvement le jour où le solde est contesté.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Référence du paiement</label>
                <input name="reference" placeholder="N° de transaction mobile money" className={champ} />
              </div>
              <button disabled={pending} className={`${bouton} bg-blue-700 text-white hover:bg-blue-800`}>
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  )
}

// ── TARIFS ─────────────────────────────────────────────────────────────────

function Tarifs({ tarifs, agir, pending }: { tarifs: LigneTarif[]; agir: Agir; pending: boolean }) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed">
        <strong>Comment le prix est calculé.</strong> En location, la commission de référence est
        un mois de loyer : un loyer de 100 000 F avec une part de 1 % coûte 1 000 crédits.
        En vente, la commission d&apos;agence est d&apos;abord estimée (taux de commission × prix),
        puis on en prélève la part. Le <strong>coût par défaut</strong> s&apos;applique aux annonces
        sans prix — nombreuses parmi celles venues de WhatsApp — sans lui leur contact serait gratuit.
      </div>

      {tarifs.map(t => (
        <form key={t.id} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3"
          action={fd => agir(async () => { fd.set("id", t.id); return reglerTarif(fd) })}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 capitalize">
              {t.type_offre}{t.categorie ? ` — ${t.categorie}` : " — toutes catégories"}
            </h3>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" name="actif" value="true" defaultChecked={t.actif} className="w-4 h-4 rounded" />
              Actif
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {t.type_offre === "vente" && (
              <div>
                <label className="text-xs font-medium text-gray-700">Commission d&apos;agence (%)</label>
                <input name="taux_commission" defaultValue={t.taux_commission ?? ""} placeholder="5" className={champ} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-700">Notre part (%)</label>
              <input name="part_pourcent" defaultValue={t.part_pourcent} required className={champ} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Coût par défaut</label>
              <input name="cout_defaut" defaultValue={t.cout_defaut} className={champ} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Plancher</label>
              <input name="cout_min" defaultValue={t.cout_min} className={champ} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Plafond (vide = aucun)</label>
              <input name="cout_max" defaultValue={t.cout_max ?? ""} className={champ} />
            </div>
          </div>

          <button disabled={pending} className={`${bouton} bg-blue-700 text-white hover:bg-blue-800`}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer
          </button>
        </form>
      ))}
    </div>
  )
}

// ── RÉCLAMATIONS ───────────────────────────────────────────────────────────

function Reclamations({ lignes, agir, pending }: { lignes: LigneReclamation[]; agir: Agir; pending: boolean }) {
  if (lignes.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">Aucune réclamation.</p>
  }
  return (
    <div className="space-y-3">
      {lignes.map(r => {
        const ouverte = r.statut === "ouverte"
        return (
          <div key={r.id} className={`rounded-2xl border p-5 ${ouverte ? "bg-white border-amber-200" : "bg-gray-50 border-gray-100"}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{r.professionnel}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.telephone} · {r.source === "diffuseur" ? "diffuseur" : "propriétaire"} ·
                  {" "}{r.cout.toLocaleString("fr-FR")} crédits
                </p>
                <p className="text-sm text-gray-700 mt-2">{r.motif}</p>
                {r.note && <p className="text-xs text-gray-500 mt-2 italic">Décision : {r.note}</p>}
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                r.statut === "ouverte" ? "bg-amber-100 text-amber-800"
                : r.statut === "remboursee" ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-600"}`}>
                {r.statut === "ouverte" ? "à trancher" : r.statut === "remboursee" ? "remboursée" : "refusée"}
              </span>
            </div>

            {ouverte && (
              <form className="mt-4 pt-4 border-t border-gray-100 space-y-3"
                action={fd => agir(async () => { fd.set("id", r.id); return trancherReclamation(fd) })}>
                <input name="note" placeholder="Motif de la décision (obligatoire pour un refus)" className={champ} />
                <div className="flex gap-2">
                  <button name="decision" value="rembourser" disabled={pending}
                    className={`${bouton} bg-green-600 text-white hover:bg-green-700`}>
                    <RotateCcw className="w-4 h-4" /> Rendre {r.cout.toLocaleString("fr-FR")} crédits
                  </button>
                  <button name="decision" value="refuser" disabled={pending}
                    className={`${bouton} bg-white border border-gray-200 text-red-600 hover:border-red-300`}>
                    <X className="w-4 h-4" /> Refuser
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Le professionnel garde le contact dans les deux cas : il l&apos;a déjà lu.
                </p>
              </form>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── NUMÉROS RETIRÉS ────────────────────────────────────────────────────────

function Retraits({ lignes, agir, pending }: { lignes: LigneRetrait[]; agir: Agir; pending: boolean }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <PhoneOff className="w-4 h-4 text-red-500" /> Retirer un numéro de la diffusion
        </h2>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Ces personnes ont publié dans un groupe WhatsApp sans accepter que leur numéro soit
          transmis à des professionnels. <strong>Honorez toute demande de retrait sans discuter</strong> :
          c&apos;est ce qui vous protège. Le numéro cesse immédiatement d&apos;être vendable.
        </p>
        <form className="space-y-3" action={fd => agir(() => retirerDeLaDiffusion(fd))}>
          <div className="grid grid-cols-2 gap-3">
            <input name="telephone" required placeholder="+225 07 00 00 00 00" className={champ} />
            <input name="motif" placeholder="Motif (demande du 07/08…)" className={champ} />
          </div>
          <button disabled={pending} className={`${bouton} bg-red-600 text-white hover:bg-red-700`}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />} Retirer
          </button>
        </form>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">Aucun numéro retiré.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          {lignes.map(l => (
            <div key={l.telephone} className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="font-mono text-sm text-gray-900">{l.telephone}</span>
              <span className="text-xs text-gray-500 truncate">{l.motif ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
