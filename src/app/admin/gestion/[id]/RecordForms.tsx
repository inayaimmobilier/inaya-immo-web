"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { createLocataire, createEncaissement, createTravaux, createVersement } from "../actions"

type Ctx = { mandatId: string; propertyId: string | null; proprietaireId: string }
type Kind = "locataire" | "encaissement" | "travaux" | "versement"
type Person = { id: string; nom: string | null; prenom?: string | null }

const ACTIONS = {
  locataire: createLocataire, encaissement: createEncaissement, travaux: createTravaux, versement: createVersement,
} as const

const LABEL: Record<Kind, string> = {
  locataire: "Ajouter un locataire", encaissement: "Enregistrer un encaissement",
  travaux: "Ajouter des travaux", versement: "Enregistrer un versement",
}

const field = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"

export default function RecordForms({ kind, ctx, locataires = [], prestataires = [], tenantAccounts = [] }: {
  kind: Kind; ctx: Ctx; locataires?: Person[]; prestataires?: Person[]; tenantAccounts?: Person[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res = await ACTIONS[kind](fd)
      if (!res.ok) { setErr(res.error); return }
      ;(e.target as HTMLFormElement).reset()
      setOpen(false); router.refresh()
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full text-left px-5 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50/50 flex items-center gap-1.5">
        <Plus className="w-4 h-4" /> {LABEL[kind]}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="px-5 py-4 bg-gray-50/60 space-y-2">
      {err && <p className="text-xs text-red-600">{err}</p>}
      <input type="hidden" name="mandat_id" value={ctx.mandatId} />
      <input type="hidden" name="property_id" value={ctx.propertyId ?? ""} />
      <input type="hidden" name="proprietaire_id" value={ctx.proprietaireId} />

      {kind === "locataire" && (
        <div className="grid grid-cols-2 gap-2">
          <input name="nom" required placeholder="Nom du locataire *" className={field} />
          <input name="telephone" placeholder="Téléphone" className={field} />
          <input name="loyer_mensuel" type="number" placeholder="Loyer mensuel (FCFA)" className={field} />
          <input name="caution" type="number" placeholder="Caution (FCFA)" className={field} />
          <input name="date_entree" type="date" className={field} />
          <select name="user_id" className={field} title="Lier un compte locataire (portail)">
            <option value="">Compte locataire (facultatif)</option>
            {tenantAccounts.map(t => <option key={t.id} value={t.id}>{`${t.prenom ?? ""} ${t.nom ?? ""}`.trim() || t.id.slice(0, 8)}</option>)}
          </select>
        </div>
      )}

      {kind === "encaissement" && (
        <div className="grid grid-cols-2 gap-2">
          <input name="periode" placeholder="Période (ex : 2026-07)" className={field} />
          <input name="montant" type="number" required placeholder="Montant (FCFA) *" className={field} />
          <select name="locataire_id" className={field}>
            <option value="">Locataire (facultatif)</option>
            {locataires.map(l => <option key={l.id} value={l.id}>{l.nom ?? l.id.slice(0, 8)}</option>)}
          </select>
          <select name="mode" className={field}>
            <option value="">Mode</option>
            <option value="especes">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="virement">Virement</option>
            <option value="cheque">Chèque</option>
          </select>
          <input name="date_encaissement" type="date" className={field} />
          <select name="statut" className={field}>
            <option value="encaisse">Encaissé</option>
            <option value="attendu">Attendu</option>
            <option value="retard">En retard</option>
          </select>
        </div>
      )}

      {kind === "travaux" && (
        <div className="grid grid-cols-2 gap-2">
          <input name="titre" required placeholder="Intitulé des travaux *" className={`${field} col-span-2`} />
          <input name="cout" type="number" placeholder="Coût (FCFA)" className={field} />
          <select name="statut" className={field}>
            <option value="demande">Demandé</option>
            <option value="devis">Devis</option>
            <option value="en_cours">En cours</option>
            <option value="termine">Terminé</option>
          </select>
          <select name="prestataire_id" className={`${field} col-span-2`}>
            <option value="">Prestataire (facultatif)</option>
            {prestataires.map(p => <option key={p.id} value={p.id}>{`${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || p.id.slice(0, 8)}</option>)}
          </select>
          <textarea name="description" rows={2} placeholder="Description" className={`${field} col-span-2 resize-none`} />
        </div>
      )}

      {kind === "versement" && (
        <div className="grid grid-cols-2 gap-2">
          <input name="periode" placeholder="Période (ex : 2026-07)" className={field} />
          <input name="montant_brut" type="number" required placeholder="Montant brut (FCFA) *" className={field} />
          <input name="commission" type="number" placeholder="Commission Inaya (FCFA)" className={field} />
          <input name="frais_travaux" type="number" placeholder="Frais travaux (FCFA)" className={field} />
          <input name="date_versement" type="date" className={field} />
          <select name="statut" className={field}>
            <option value="planifie">Planifié</option>
            <option value="verse">Versé</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-white">Annuler</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Enregistrer
        </button>
      </div>
    </form>
  )
}
