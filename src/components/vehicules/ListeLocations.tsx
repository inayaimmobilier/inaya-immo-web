"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDays, Phone, Car, Play, Check, X, AlertTriangle, Search, Gauge,
} from "lucide-react"
import { changerStatutLocation, enregistrerReleve } from "@/app/admin/locations/actions"

export interface LocationLigne {
  id: string
  reference: number | null
  vehicule: string
  immatriculation: string | null
  client_nom: string
  client_telephone: string
  debut: string
  fin: string
  statut: string
  montant_total: number
  depot_garantie: number
  avec_chauffeur: boolean
  km_depart: number | null
  km_retour: number | null
  frais_carburant: number | null
  frais_retard: number | null
  frais_km_supp: number | null
  penalites: number | null
  depot_restitue: number | null
  loueur_nom: string
}

const STATUTS: Record<string, { l: string; cls: string }> = {
  reservee: { l: "Réservée", cls: "bg-amber-50 text-amber-700" },
  en_cours: { l: "En cours", cls: "bg-blue-50 text-blue-700" },
  terminee: { l: "Terminée", cls: "bg-green-50 text-green-700" },
  annulee: { l: "Annulée", cls: "bg-gray-100 text-gray-500" },
  litige: { l: "Litige", cls: "bg-red-50 text-red-700" },
}

const dateFr = (s: string) =>
  new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })

export default function ListeLocations(
  { locations, montrerLoueur = false }: { locations: LocationLigne[]; montrerLoueur?: boolean },
) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState("")
  const [filtre, setFiltre] = useState("actives")
  const [erreur, setErreur] = useState<string | null>(null)
  const [releve, setReleve] = useState<LocationLigne | null>(null)
  const [form, setForm] = useState({
    km_depart: "", km_retour: "", frais_carburant: "", frais_retard: "",
    frais_km_supp: "", penalites: "", depot_restitue: "",
  })

  const liste = useMemo(() => {
    const r = q.trim().toLowerCase()
    return locations.filter(l => {
      if (filtre === "actives" && !["reservee", "en_cours"].includes(l.statut)) return false
      if (filtre !== "actives" && filtre !== "toutes" && l.statut !== filtre) return false
      if (!r) return true
      return [l.client_nom, l.client_telephone, l.vehicule, String(l.reference ?? "")]
        .some(x => x.toLowerCase().includes(r))
    })
  }, [locations, q, filtre])

  /**
   * Ouvre le relevé PRÉREMPLI avec ce qui est déjà enregistré.
   *
   * Les frais remplacent le total au lieu de s'y ajouter — c'est ce qui rend
   * un double enregistrement sans effet. Mais partir de champs vides
   * remettrait alors tous les frais à zéro au second passage : le préremplissage
   * n'est pas un confort, il est la condition de la correction précédente.
   */
  const ouvrirReleve = (l: LocationLigne) => {
    setErreur(null)
    const txt = (n: number | null) => (n == null ? "" : String(n))
    setForm({
      km_depart: txt(l.km_depart), km_retour: txt(l.km_retour),
      frais_carburant: txt(l.frais_carburant), frais_retard: txt(l.frais_retard),
      frais_km_supp: txt(l.frais_km_supp), penalites: txt(l.penalites),
      depot_restitue: txt(l.depot_restitue),
    })
    setReleve(l)
  }

  const agir = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErreur(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setErreur(r.error ?? "Échec."); return }
      setReleve(null)
      router.refresh()
    })
  }

  const nb = (v: string) => (v === "" ? null : Number(v))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Client, téléphone, véhicule, n°…"
            className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 w-72" />
        </div>
        {[["actives", "À traiter"], ["reservee", "Réservées"], ["en_cours", "En cours"],
          ["terminee", "Terminées"], ["litige", "Litiges"], ["toutes", "Toutes"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              filtre === v ? "bg-blue-600 text-white border-blue-600"
                           : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{erreur}</p>
      )}

      {liste.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Aucune location.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {liste.map(l => {
            const st = STATUTS[l.statut] ?? STATUTS.reservee
            return (
              <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{l.client_nom}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${st.cls}`}>{st.l}</span>
                      {l.reference && <span className="text-[11px] text-gray-400">N° {l.reference}</span>}
                      {l.avec_chauffeur && (
                        <span className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">
                          Avec chauffeur
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {l.client_telephone}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Car className="w-3 h-3" /> {l.vehicule}
                        {l.immatriculation ? ` · ${l.immatriculation}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> {dateFr(l.debut)} → {dateFr(l.fin)}
                      </span>
                      {montrerLoueur && <span className="text-gray-400">{l.loueur_nom}</span>}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {l.montant_total.toLocaleString("fr-FR")} F
                      {l.depot_garantie > 0 && (
                        <span className="text-xs font-normal text-gray-500">
                          {" "}· caution {l.depot_garantie.toLocaleString("fr-FR")} F
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    {l.statut === "reservee" && (
                      <>
                        <button onClick={() => agir(() => changerStatutLocation(l.id, "en_cours"))}
                          disabled={pending} title="Démarrer la location"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700">
                          <Play className="w-3.5 h-3.5" /> Démarrer
                        </button>
                        <button onClick={() => agir(() => changerStatutLocation(l.id, "annulee"))}
                          disabled={pending} title="Annuler"
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {l.statut === "en_cours" && (
                      <>
                        <button onClick={() => ouvrirReleve(l)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50">
                          <Gauge className="w-3.5 h-3.5" /> Relevé
                        </button>
                        <button onClick={() => agir(() => changerStatutLocation(l.id, "terminee"))}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700">
                          <Check className="w-3.5 h-3.5" /> Clôturer
                        </button>
                        <button onClick={() => agir(() => changerStatutLocation(l.id, "litige"))}
                          disabled={pending} title="Signaler un litige"
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50">
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {releve?.id === l.id && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-700">
                      Relevé — les frais s&apos;ajoutent au total
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        ["km_depart", "Km au départ"], ["km_retour", "Km au retour"],
                        ["frais_carburant", "Frais carburant"], ["frais_retard", "Frais de retard"],
                        ["frais_km_supp", "Km supplémentaires"], ["penalites", "Pénalités"],
                        ["depot_restitue", "Dépôt restitué"],
                      ] as const).map(([cle, libelle]) => (
                        <label key={cle} className="text-[11px] text-gray-500">
                          {libelle}
                          <input type="number" className="w-full mt-0.5 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm"
                            value={form[cle]}
                            onChange={e => setForm({ ...form, [cle]: e.target.value })} />
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setReleve(null)} className="px-3 py-1.5 text-xs text-gray-600">
                        Annuler
                      </button>
                      <button disabled={pending}
                        onClick={() => agir(() => enregistrerReleve(l.id, {
                          km_depart: nb(form.km_depart), km_retour: nb(form.km_retour),
                          frais_carburant: nb(form.frais_carburant), frais_retard: nb(form.frais_retard),
                          frais_km_supp: nb(form.frais_km_supp), penalites: nb(form.penalites),
                          depot_restitue: nb(form.depot_restitue),
                        }))}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg">
                        Enregistrer le relevé
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
