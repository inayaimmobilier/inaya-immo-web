"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Save } from "lucide-react"
import {
  ETAPES, TYPES_VEHICULE, CARBURANTS, BOITES, TRANSMISSIONS, STATUTS_VEHICULE,
  TYPES_DOCUMENT, EMPLACEMENTS_PHOTO, FRAIS_COURANTS, UNITES_FRAIS,
  type VehiculeInput, type Option,
} from "@/lib/vehicules"
import { creerVehicule, majVehicule } from "@/app/admin/vehicules/actions"

export interface Equipement { code: string; libelle: string; categorie: string }
export interface LoueurBref { id: string; nom: string }

interface Props {
  initial: VehiculeInput
  vehiculeId?: string
  equipements: Equipement[]
  /** Vide côté loueur : il ne choisit pas le propriétaire, c'est lui. */
  loueurs?: LoueurBref[]
  retour: string
}

const champ = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
const lbl = "block text-xs text-gray-500"

function Choix({ value, onChange, options }: {
  value: string | null | undefined
  onChange: (v: string) => void
  options: Option[]
}) {
  return (
    <select className={champ + " mt-1"} value={value ?? ""} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

function Nombre({ v, on, ph }: { v: number | null | undefined; on: (n: number | null) => void; ph?: string }) {
  return (
    <input type="number" className={champ + " mt-1"} placeholder={ph}
      value={v ?? ""} onChange={e => on(e.target.value === "" ? null : Number(e.target.value))} />
  )
}

export default function VehiculeForm(
  { initial, vehiculeId, equipements, loueurs, retour }: Props,
) {
  const router = useRouter()
  const [v, setV] = useState<VehiculeInput>(initial)
  const [etape, setEtape] = useState(0)
  const [pending, start] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  const set = (patch: Partial<VehiculeInput>) => setV(x => ({ ...x, ...patch }))

  function enregistrer(publierAussi?: boolean) {
    setErreur(null)
    const payload = publierAussi === undefined ? v : { ...v, publie: publierAussi }
    start(async () => {
      const r = vehiculeId
        ? await majVehicule(vehiculeId, payload)
        : await creerVehicule(payload)
      if (!r.ok) {
        setErreur(r.error)
        return
      }
      router.push(retour)
      router.refresh()
    })
  }

  const parCategorie = equipements.reduce<Record<string, Equipement[]>>((acc, e) => {
    (acc[e.categorie] ??= []).push(e)
    return acc
  }, {})

  const basculeEquip = (code: string) =>
    set({
      equipements: v.equipements.includes(code)
        ? v.equipements.filter(c => c !== code)
        : [...v.equipements, code],
    })

  return (
    <div className="space-y-4">
      {/* ── Fil des étapes ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {ETAPES.map((nom, i) => (
            <button key={nom} onClick={() => setEtape(i)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                i === etape ? "bg-blue-600 text-white"
                : i < etape ? "bg-blue-50 text-blue-700"
                : "text-gray-500 hover:bg-gray-50"}`}>
              {i + 1}. {nom}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{erreur}</p>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">

        {/* ── 1. Identification ──────────────────────────────────────── */}
        {etape === 0 && (
          <>
            {loueurs && (
              <label className={lbl}>
                Propriétaire du véhicule *
                <select className={champ + " mt-1"} value={v.loueur_id}
                  onChange={e => set({ loueur_id: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {loueurs.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Type
                <Choix value={v.type_vehicule} options={TYPES_VEHICULE}
                  onChange={x => set({ type_vehicule: x })} /></label>
              <label className={lbl}>Marque *
                <input className={champ + " mt-1"} value={v.marque}
                  onChange={e => set({ marque: e.target.value })} /></label>
              <label className={lbl}>Modèle *
                <input className={champ + " mt-1"} value={v.modele}
                  onChange={e => set({ modele: e.target.value })} /></label>
              <label className={lbl}>Version / finition
                <input className={champ + " mt-1"} value={v.finition ?? ""}
                  onChange={e => set({ finition: e.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Année de fabrication
                <Nombre v={v.annee_fabrication} on={n => set({ annee_fabrication: n })} /></label>
              <label className={lbl}>1re mise en circulation
                <Nombre v={v.annee_circulation} on={n => set({ annee_circulation: n })} /></label>
              <label className={lbl}>Couleur
                <input className={champ + " mt-1"} value={v.couleur ?? ""}
                  onChange={e => set({ couleur: e.target.value })} /></label>
              <label className={lbl}>Kilométrage
                <Nombre v={v.kilometrage} on={n => set({ kilometrage: n })} /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Immatriculation
                <input className={champ + " mt-1 uppercase"} value={v.immatriculation ?? ""}
                  onChange={e => set({ immatriculation: e.target.value })} /></label>
              <label className={lbl}>N° VIN / châssis
                <input className={champ + " mt-1 uppercase"} value={v.vin ?? ""}
                  onChange={e => set({ vin: e.target.value })} /></label>
              <label className={lbl}>N° de série
                <input className={champ + " mt-1"} value={v.numero_serie ?? ""}
                  onChange={e => set({ numero_serie: e.target.value })} /></label>
              <label className={lbl}>Date d&apos;acquisition
                <input type="date" className={champ + " mt-1"} value={v.date_acquisition ?? ""}
                  onChange={e => set({ date_acquisition: e.target.value })} /></label>
            </div>
            <label className={lbl}>Description publique
              <textarea rows={3} className={champ + " mt-1"} value={v.description ?? ""}
                onChange={e => set({ description: e.target.value })} /></label>
            <p className="text-[11px] text-gray-400">
              VIN, numéro de série et notes internes ne sont jamais montrés au public.
            </p>
          </>
        )}

        {/* ── 2. Caractéristiques ────────────────────────────────────── */}
        {etape === 1 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Carburant
                <Choix value={v.carburant} options={CARBURANTS} onChange={x => set({ carburant: x })} /></label>
              <label className={lbl}>Boîte de vitesses
                <Choix value={v.boite} options={BOITES} onChange={x => set({ boite: x })} /></label>
              <label className={lbl}>Transmission
                <Choix value={v.transmission} options={TRANSMISSIONS} onChange={x => set({ transmission: x })} /></label>
              <label className={lbl}>Nombre de rapports
                <Nombre v={v.nb_rapports} on={n => set({ nb_rapports: n })} /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Cylindrée (cm³)
                <Nombre v={v.cylindree} on={n => set({ cylindree: n })} /></label>
              <label className={lbl}>Puissance (ch)
                <Nombre v={v.puissance_ch} on={n => set({ puissance_ch: n })} /></label>
              <label className={lbl}>Nb de cylindres
                <Nombre v={v.nb_cylindres} on={n => set({ nb_cylindres: n })} /></label>
              <label className={lbl}>Consommation (L/100 km)
                <Nombre v={v.consommation} on={n => set({ consommation: n })} /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className={lbl}>Places
                <Nombre v={v.nb_places} on={n => set({ nb_places: n })} /></label>
              <label className={lbl}>Portes
                <Nombre v={v.nb_portes} on={n => set({ nb_portes: n })} /></label>
              <label className={lbl}>Coffre (L)
                <Nombre v={v.volume_coffre} on={n => set({ volume_coffre: n })} /></label>
              <label className={lbl}>Réservoir (L)
                <Nombre v={v.capacite_reservoir} on={n => set({ capacite_reservoir: n })} /></label>
              <label className={lbl}>Charge utile (kg)
                <Nombre v={v.charge_utile} on={n => set({ charge_utile: n })} /></label>
            </div>
          </>
        )}

        {/* ── 3. Équipements ─────────────────────────────────────────── */}
        {etape === 2 && (
          <>
            {equipements.length === 0 && (
              <p className="text-sm text-gray-500">
                Aucun équipement dans le référentiel. Appliquez la migration 059.
              </p>
            )}
            {Object.entries(parCategorie).map(([cat, liste]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-700 capitalize mb-2">
                  {cat.replace("_", " ")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {liste.map(e => (
                    <label key={e.code}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={v.equipements.includes(e.code)}
                        onChange={() => basculeEquip(e.code)}
                        className="w-4 h-4 rounded border-gray-300" />
                      {e.libelle}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── 4. Photos ──────────────────────────────────────────────── */}
        {etape === 3 && (
          <>
            <p className="text-xs text-gray-500">
              Collez l&apos;adresse de chaque photo. Le téléversement direct depuis le
              téléphone arrive à la prochaine étape du module ; en attendant, une
              photo déjà en ligne fait l&apos;affaire.
            </p>
            {v.photos.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <label className={lbl + " col-span-6"}>Adresse de la photo
                  <input className={champ + " mt-1"} value={p.url}
                    onChange={e => {
                      const photos = [...v.photos]; photos[i] = { ...p, url: e.target.value }
                      set({ photos })
                    }} /></label>
                <label className={lbl + " col-span-3"}>Prise de vue
                  <select className={champ + " mt-1"} value={p.emplacement}
                    onChange={e => {
                      const photos = [...v.photos]; photos[i] = { ...p, emplacement: e.target.value }
                      set({ photos })
                    }}>
                    <option value="">—</option>
                    {EMPLACEMENTS_PHOTO.map(x => <option key={x} value={x}>{x}</option>)}
                  </select></label>
                <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600 pb-2">
                  <input type="radio" name="principale" checked={p.principale}
                    onChange={() => set({
                      photos: v.photos.map((x, k) => ({ ...x, principale: k === i })),
                    })} />
                  Principale
                </label>
                <button onClick={() => set({ photos: v.photos.filter((_, k) => k !== i) })}
                  className="col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg mb-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => set({
                photos: [...v.photos, {
                  url: "", emplacement: "", principale: v.photos.length === 0,
                }],
              })}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <Plus className="w-4 h-4" /> Ajouter une photo
            </button>
            <label className={lbl + " block"}>Vidéo de présentation (lien)
              <input className={champ + " mt-1"} value={v.video_url ?? ""}
                onChange={e => set({ video_url: e.target.value })} /></label>
          </>
        )}

        {/* ── 5. Tarification ────────────────────────────────────────── */}
        {etape === 4 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Prix par heure
                <Nombre v={v.prix_heure} on={n => set({ prix_heure: n })} /></label>
              <label className={lbl}>Prix par jour
                <Nombre v={v.prix_jour} on={n => set({ prix_jour: n })} /></label>
              <label className={lbl}>Prix par semaine
                <Nombre v={v.prix_semaine} on={n => set({ prix_semaine: n })} /></label>
              <label className={lbl}>Prix par mois
                <Nombre v={v.prix_mois} on={n => set({ prix_mois: n })} /></label>
            </div>

            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-700">Tarif dégressif par durée</p>
              <p className="text-[11px] text-gray-400 mb-2">
                Facultatif. Un palier l&apos;emporte sur le prix par jour ci-dessus.
                Laisser « jusqu&apos;à » vide pour le dernier palier (« et au-delà »).
              </p>
              {v.tarifs.map((t, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end mb-2">
                  <label className={lbl + " col-span-3"}>À partir de (jours)
                    <Nombre v={t.jour_min} on={n => {
                      const tarifs = [...v.tarifs]; tarifs[i] = { ...t, jour_min: n ?? 1 }; set({ tarifs })
                    }} /></label>
                  <label className={lbl + " col-span-3"}>Jusqu&apos;à (jours)
                    <Nombre v={t.jour_max} ph="et au-delà" on={n => {
                      const tarifs = [...v.tarifs]; tarifs[i] = { ...t, jour_max: n }; set({ tarifs })
                    }} /></label>
                  <label className={lbl + " col-span-5"}>Prix par jour (FCFA)
                    <Nombre v={t.prix_jour} on={n => {
                      const tarifs = [...v.tarifs]; tarifs[i] = { ...t, prix_jour: n ?? 0 }; set({ tarifs })
                    }} /></label>
                  <button onClick={() => set({ tarifs: v.tarifs.filter((_, k) => k !== i) })}
                    className="col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg mb-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => set({
                  tarifs: [...v.tarifs, {
                    jour_min: (v.tarifs.at(-1)?.jour_max ?? 0) + 1, jour_max: null, prix_jour: 0,
                  }],
                })}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Plus className="w-4 h-4" /> Ajouter un palier
              </button>
            </div>

            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-700 mb-2">Frais supplémentaires</p>
              {v.frais.map((f, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end mb-2">
                  <label className={lbl + " col-span-4"}>Frais
                    <select className={champ + " mt-1"} value={f.code}
                      onChange={e => {
                        const opt = FRAIS_COURANTS.find(x => x.v === e.target.value)
                        const frais = [...v.frais]
                        frais[i] = { ...f, code: e.target.value, libelle: opt?.l ?? e.target.value }
                        set({ frais })
                      }}>
                      <option value="">— Choisir —</option>
                      {FRAIS_COURANTS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
                    </select></label>
                  <label className={lbl + " col-span-4"}>Montant (FCFA)
                    <Nombre v={f.montant} on={n => {
                      const frais = [...v.frais]; frais[i] = { ...f, montant: n ?? 0 }; set({ frais })
                    }} /></label>
                  <label className={lbl + " col-span-3"}>Unité
                    <select className={champ + " mt-1"} value={f.unite}
                      onChange={e => {
                        const frais = [...v.frais]; frais[i] = { ...f, unite: e.target.value }; set({ frais })
                      }}>
                      {UNITES_FRAIS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
                    </select></label>
                  <button onClick={() => set({ frais: v.frais.filter((_, k) => k !== i) })}
                    className="col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg mb-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => set({ frais: [...v.frais, { code: "", libelle: "", montant: 0, unite: "forfait" }] })}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Plus className="w-4 h-4" /> Ajouter un frais
              </button>
            </div>
          </>
        )}

        {/* ── 6. Conditions ──────────────────────────────────────────── */}
        {etape === 5 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={lbl}>Km inclus / jour
                <Nombre v={v.km_inclus_jour} on={n => set({ km_inclus_jour: n })} /></label>
              <label className={lbl}>Km inclus / semaine
                <Nombre v={v.km_inclus_semaine} on={n => set({ km_inclus_semaine: n })} /></label>
              <label className={lbl}>Km inclus / mois
                <Nombre v={v.km_inclus_mois} on={n => set({ km_inclus_mois: n })} /></label>
              <label className={lbl}>Prix du km supplémentaire
                <Nombre v={v.prix_km_supp} on={n => set({ prix_km_supp: n })} /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className={lbl}>Dépôt de garantie
                <Nombre v={v.depot_garantie} on={n => set({ depot_garantie: n })} /></label>
              <label className={lbl}>Franchise
                <Nombre v={v.franchise} on={n => set({ franchise: n })} /></label>
              <label className={lbl}>Âge minimum
                <Nombre v={v.age_min_conducteur} on={n => set({ age_min_conducteur: n })} /></label>
              <label className={lbl}>Années de permis
                <Nombre v={v.anciennete_permis} on={n => set({ anciennete_permis: n })} /></label>
              <label className={lbl}>Conducteurs max
                <Nombre v={v.nb_conducteurs_max} on={n => set({ nb_conducteurs_max: n })} /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {([
                ["sortie_territoire", "Sortie du territoire"],
                ["sortie_ville", "Sortie de la ville"],
                ["transport_marchandises", "Transport de marchandises"],
                ["animaux_autorises", "Animaux autorisés"],
                ["fumeur_autorise", "Fumeur autorisé"],
                ["usage_commercial", "Usage commercial"],
              ] as const).map(([cle, libelle]) => (
                <label key={cle} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={v[cle]}
                    onChange={e => set({ [cle]: e.target.checked } as Partial<VehiculeInput>)}
                    className="w-4 h-4 rounded border-gray-300" />
                  {libelle}
                </label>
              ))}
            </div>
          </>
        )}

        {/* ── 7. Documents ───────────────────────────────────────────── */}
        {etape === 6 && (
          <>
            <p className="text-xs text-gray-500">
              Les dates d&apos;expiration alimentent les alertes : une assurance périmée
              immobilise le véhicule. Un document sans date ne déclenche rien.
            </p>
            {v.documents.map((d, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <label className={lbl + " col-span-3"}>Type
                  <select className={champ + " mt-1"} value={d.type}
                    onChange={e => {
                      const docs = [...v.documents]; docs[i] = { ...d, type: e.target.value }
                      set({ documents: docs })
                    }}>
                    {TYPES_DOCUMENT.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
                  </select></label>
                <label className={lbl + " col-span-3"}>Numéro
                  <input className={champ + " mt-1"} value={d.numero}
                    onChange={e => {
                      const docs = [...v.documents]; docs[i] = { ...d, numero: e.target.value }
                      set({ documents: docs })
                    }} /></label>
                <label className={lbl + " col-span-2"}>Émission
                  <input type="date" className={champ + " mt-1"} value={d.date_emission}
                    onChange={e => {
                      const docs = [...v.documents]; docs[i] = { ...d, date_emission: e.target.value }
                      set({ documents: docs })
                    }} /></label>
                <label className={lbl + " col-span-3"}>Expiration
                  <input type="date" className={champ + " mt-1"} value={d.date_expiration}
                    onChange={e => {
                      const docs = [...v.documents]; docs[i] = { ...d, date_expiration: e.target.value }
                      set({ documents: docs })
                    }} /></label>
                <button onClick={() => set({ documents: v.documents.filter((_, k) => k !== i) })}
                  className="col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg mb-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => set({
                documents: [...v.documents, {
                  type: "assurance", numero: "", date_emission: "",
                  date_expiration: "", fichier_url: "",
                }],
              })}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <Plus className="w-4 h-4" /> Ajouter un document
            </button>
          </>
        )}

        {/* ── 8. Disponibilité ───────────────────────────────────────── */}
        {etape === 7 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className={lbl}>Statut
                <select className={champ + " mt-1"} value={v.statut}
                  onChange={e => set({ statut: e.target.value })}>
                  {Object.entries(STATUTS_VEHICULE).map(([k, s]) => (
                    <option key={k} value={k}>{s.l}</option>
                  ))}
                </select></label>
              <label className={lbl}>Ville
                <input className={champ + " mt-1"} value={v.ville ?? ""}
                  onChange={e => set({ ville: e.target.value })} /></label>
              <label className={lbl}>Quartier
                <input className={champ + " mt-1"} value={v.quartier ?? ""}
                  onChange={e => set({ quartier: e.target.value })} /></label>
            </div>
            <label className={lbl + " block"}>Adresse / point de retrait
              <input className={champ + " mt-1"} value={v.adresse ?? ""}
                onChange={e => set({ adresse: e.target.value })} /></label>
            <label className={lbl + " block"}>Notes internes (jamais publiques)
              <textarea rows={2} className={champ + " mt-1"} value={v.notes_internes ?? ""}
                onChange={e => set({ notes_internes: e.target.value })} /></label>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <label className="flex items-center gap-2 text-sm text-blue-900 cursor-pointer">
                <input type="checkbox" checked={v.publie}
                  onChange={e => set({ publie: e.target.checked })}
                  className="w-4 h-4 rounded border-blue-300" />
                Publier ce véhicule dans le catalogue
              </label>
              <p className="text-[11px] text-blue-800 mt-1">
                La publication exige au moins un tarif et une photo — sans quoi
                l&apos;annonce ne sert à personne.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setEtape(e => Math.max(0, e - 1))} disabled={etape === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 disabled:opacity-40">
          <ChevronLeft className="w-4 h-4" /> Précédent
        </button>

        <div className="flex items-center gap-2">
          {/* Enregistrer est disponible à CHAQUE étape : une fiche se remplit
              rarement d'un trait, et perdre la saisie parce qu'on n'a pas
              atteint la dernière étape serait le meilleur moyen de ne plus
              jamais l'utiliser. */}
          <button onClick={() => enregistrer()} disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-60">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
          {etape < ETAPES.length - 1 ? (
            <button onClick={() => setEtape(e => Math.min(ETAPES.length - 1, e + 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => enregistrer(true)} disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-60">
              <Check className="w-4 h-4" /> Enregistrer et publier
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
