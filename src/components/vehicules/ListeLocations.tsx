"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDays, Phone, Car, Play, Check, X, AlertTriangle, Search, Gauge,
  ClipboardCheck,
} from "lucide-react"
import {
  changerStatutLocation, enregistrerReleve, enregistrerInspection,
} from "@/app/admin/locations/actions"
import { POINTS_INSPECTION, ETATS_POINT, NIVEAUX_CARBURANT } from "@/lib/vehicules"

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

  // ── État des lieux ────────────────────────────────────────────────────
  const [constat, setConstat] = useState<{ loc: LocationLigne; moment: "depart" | "retour" } | null>(null)
  const [ins, setIns] = useState({
    kilometrage: "", carburant: "plein", proprete: "bon", observations: "",
    points: {} as Record<string, string>,
  })

  /**
   * Ouvre un constat, tous les points à « bon ».
   *
   * C'est l'état habituel : forcer douze choix identiques ferait bâcler les
   * deux ou trois qui comptent vraiment, et un constat bâclé ne protège
   * personne le jour du litige.
   */
  const ouvrirConstat = (loc: LocationLigne, moment: "depart" | "retour") => {
    setErreur(null)
    const points: Record<string, string> = {}
    for (const p of POINTS_INSPECTION) points[p.element] = "bon"
    setIns({
      kilometrage: String((moment === "depart" ? loc.km_depart : loc.km_retour) ?? ""),
      carburant: "plein", proprete: "bon", observations: "", points,
    })
    setConstat({ loc, moment })
  }

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
                        <button onClick={() => ouvrirConstat(l, "depart")}
                          title="État des lieux de départ"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50">
                          <ClipboardCheck className="w-3.5 h-3.5" /> Constat
                        </button>
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
                        <button onClick={() => ouvrirConstat(l, "retour")}
                          title="État des lieux de retour"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50">
                          <ClipboardCheck className="w-3.5 h-3.5" /> Constat
                        </button>
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

      {/* ── État des lieux ─────────────────────────────────────────────── */}
      {constat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">
                  État des lieux — {constat.moment === "depart" ? "départ" : "retour"}
                </h3>
                <p className="text-xs text-gray-500">
                  {constat.loc.vehicule} · {constat.loc.client_nom}
                </p>
              </div>
              <button onClick={() => setConstat(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {erreur && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">{erreur}</p>}

              <div className="grid grid-cols-3 gap-2">
                <label className="text-[11px] text-gray-500">
                  Kilométrage
                  <input type="number" className="w-full mt-0.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    value={ins.kilometrage}
                    onChange={e => setIns({ ...ins, kilometrage: e.target.value })} />
                </label>
                <label className="text-[11px] text-gray-500">
                  Carburant
                  <select className="w-full mt-0.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    value={ins.carburant} onChange={e => setIns({ ...ins, carburant: e.target.value })}>
                    {NIVEAUX_CARBURANT.map(n => <option key={n.v} value={n.v}>{n.l}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-gray-500">
                  Propreté
                  <select className="w-full mt-0.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    value={ins.proprete} onChange={e => setIns({ ...ins, proprete: e.target.value })}>
                    <option value="bon">Bon</option>
                    <option value="moyen">Moyen</option>
                    <option value="mauvais">Mauvais</option>
                  </select>
                </label>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                {POINTS_INSPECTION.map((p, i) => (
                  <div key={p.element}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 ${i % 2 ? "bg-gray-50" : ""}`}>
                    <span className="text-sm text-gray-700">{p.element}</span>
                    <div className="flex gap-1">
                      {ETATS_POINT.map(e => (
                        <button key={e.v}
                          onClick={() => setIns({ ...ins, points: { ...ins.points, [p.element]: e.v } })}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${
                            ins.points[p.element] === e.v
                              ? e.v === "bon" ? "bg-green-600 text-white border-green-600"
                                : e.v === "moyen" ? "bg-amber-500 text-white border-amber-500"
                                : "bg-red-600 text-white border-red-600"
                              : "bg-white text-gray-500 border-gray-200"}`}>
                          {e.l}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <label className="text-[11px] text-gray-500 block">
                Observations
                <textarea rows={2} className="w-full mt-0.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  value={ins.observations}
                  onChange={e => setIns({ ...ins, observations: e.target.value })} />
              </label>
              <p className="text-[11px] text-gray-400">
                Enregistrer à nouveau remplace le constat précédent : un relevé
                fait trop vite au comptoir reste corrigeable.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setConstat(null)} className="px-4 py-2 text-sm text-gray-600">
                Annuler
              </button>
              <button disabled={pending}
                onClick={() => agir(async () => {
                  const r = await enregistrerInspection(constat.loc.id, {
                    moment: constat.moment,
                    kilometrage: nb(ins.kilometrage),
                    carburant: ins.carburant, proprete: ins.proprete,
                    observations: ins.observations, points: ins.points,
                  })
                  if (r.ok) setConstat(null)
                  return r
                })}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-60">
                Enregistrer le constat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
