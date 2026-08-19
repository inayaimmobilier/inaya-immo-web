import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import {
  Car, Users, Fuel, Cog, MapPin, ArrowLeft, Gauge, DoorOpen,
  ShieldCheck, Ban, Check,
} from "lucide-react"
import { CARBURANTS, BOITES, TYPES_VEHICULE, TRANSMISSIONS } from "@/lib/vehicules"
import DemandeReservation from "./DemandeReservation"

export const dynamic = "force-dynamic"

const prixFr = (n: number) => n.toLocaleString("fr-FR")

interface Vehicule {
  id: string; reference: number | null; marque: string; modele: string; finition: string | null
  type_vehicule: string; annee_circulation: number | null; annee_fabrication: number | null
  couleur: string | null; kilometrage: number | null; description: string | null
  carburant: string | null; boite: string | null; transmission: string | null
  nb_places: number | null; nb_portes: number | null; volume_coffre: number | null
  consommation: number | null; puissance_ch: number | null
  prix_heure: number | null; prix_jour: number | null; prix_semaine: number | null; prix_mois: number | null
  km_inclus_jour: number | null; prix_km_supp: number | null
  depot_garantie: number | null; franchise: number | null
  age_min_conducteur: number | null; anciennete_permis: number | null
  sortie_territoire: boolean; sortie_ville: boolean; animaux_autorises: boolean
  fumeur_autorise: boolean; usage_commercial: boolean
  ville: string | null; quartier: string | null; statut: string
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data } = await db.from("vehicules_publics")
    .select("marque,modele,ville,prix_jour").eq("id", id).maybeSingle()
  const v = data as { marque: string; modele: string; ville: string | null; prix_jour: number | null } | null
  if (!v) return { title: "Véhicule · Inaya Immo" }
  return {
    title: `${v.marque} ${v.modele} en location${v.ville ? ` à ${v.ville}` : ""} · Inaya Immo`,
    description: v.prix_jour
      ? `Louez une ${v.marque} ${v.modele} à partir de ${prixFr(v.prix_jour)} FCFA par jour.`
      : `Louez une ${v.marque} ${v.modele} avec Inaya Immo.`,
  }
}

export default async function FicheVehiculePublique(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = createAdminClient()

  // La vue publique ne contient ni VIN, ni traceur, ni notes internes : ce qui
  // n'y est pas ne peut pas fuir par cette page.
  const { data } = await db.from("vehicules_publics").select("*").eq("id", id).maybeSingle()
  const v = data as Vehicule | null
  if (!v || v.statut === "archive") notFound()

  const [photos, equipements, tarifs] = await Promise.all([
    db.from("vehicule_photos").select("url,emplacement,principale,ordre")
      .eq("vehicule_id", id).order("ordre"),
    db.from("vehicule_equipements").select("equipement").eq("vehicule_id", id),
    db.from("vehicule_tarifs").select("jour_min,jour_max,prix_jour")
      .eq("vehicule_id", id).order("jour_min"),
  ])

  const listePhotos = (photos.data ?? []) as { url: string; principale: boolean }[]
  const principale = listePhotos.find(p => p.principale)?.url ?? listePhotos[0]?.url ?? null
  const codes = ((equipements.data ?? []) as { equipement: string }[]).map(e => e.equipement)

  const { data: libelles } = codes.length
    ? await db.from("equipements_vehicule").select("code,libelle").in("code", codes)
    : { data: [] }
  const nomsEquip = ((libelles ?? []) as { libelle: string }[]).map(e => e.libelle)

  const grille = (tarifs.data ?? []) as { jour_min: number; jour_max: number | null; prix_jour: number }[]

  const caract = [
    { Icon: Users, l: "Places", v: v.nb_places },
    { Icon: DoorOpen, l: "Portes", v: v.nb_portes },
    { Icon: Cog, l: "Boîte", v: BOITES.find(b => b.v === v.boite)?.l },
    { Icon: Fuel, l: "Carburant", v: CARBURANTS.find(c => c.v === v.carburant)?.l },
    { Icon: Gauge, l: "Transmission", v: TRANSMISSIONS.find(t => t.v === v.transmission)?.l },
    { Icon: Car, l: "Type", v: TYPES_VEHICULE.find(t => t.v === v.type_vehicule)?.l },
  ].filter(c => c.v)

  const regles = [
    { ok: v.sortie_ville, l: "Sortie de la ville" },
    { ok: v.sortie_territoire, l: "Sortie du territoire" },
    { ok: v.animaux_autorises, l: "Animaux à bord" },
    { ok: v.fumeur_autorise, l: "Fumeur" },
    { ok: v.usage_commercial, l: "Usage commercial" },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Link href="/vehicules" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Tous les véhicules
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl overflow-hidden bg-gray-100 h-72 flex items-center justify-center">
            {principale
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={principale} alt={`${v.marque} ${v.modele}`} className="w-full h-full object-cover" />
              : <Car className="w-14 h-14 text-gray-300" />}
          </div>
          {listePhotos.length > 1 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {listePhotos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p.url} alt="" className="h-16 w-full object-cover rounded-xl" />
              ))}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {v.marque} {v.modele} {v.finition ?? ""}
            </h1>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              {v.annee_circulation && <span>{v.annee_circulation}</span>}
              {v.couleur && <span>{v.couleur}</span>}
              {v.ville && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {v.ville}{v.quartier ? ` · ${v.quartier}` : ""}
                </span>
              )}
              {v.reference && <span className="text-gray-400">Réf. {v.reference}</span>}
            </p>
          </div>

          {v.description && (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{v.description}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {caract.map(({ Icon, l, v: val }) => (
              <div key={l} className="bg-white rounded-2xl border border-gray-100 p-3">
                <Icon className="w-4 h-4 text-blue-600 mb-1" />
                <p className="text-xs text-gray-500">{l}</p>
                <p className="text-sm font-semibold text-gray-900">{val}</p>
              </div>
            ))}
          </div>

          {nomsEquip.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Équipements</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {nomsEquip.map(e => (
                  <p key={e} className="text-sm text-gray-700 inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-green-600 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Conditions de location</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {v.km_inclus_jour != null && (
                <div><p className="text-xs text-gray-500">Km inclus / jour</p><p className="font-semibold">{v.km_inclus_jour} km</p></div>
              )}
              {v.prix_km_supp != null && (
                <div><p className="text-xs text-gray-500">Km supplémentaire</p><p className="font-semibold">{prixFr(v.prix_km_supp)} F</p></div>
              )}
              {v.depot_garantie != null && (
                <div><p className="text-xs text-gray-500">Dépôt de garantie</p><p className="font-semibold">{prixFr(v.depot_garantie)} F</p></div>
              )}
              {v.age_min_conducteur != null && (
                <div><p className="text-xs text-gray-500">Âge minimum</p><p className="font-semibold">{v.age_min_conducteur} ans</p></div>
              )}
              {v.anciennete_permis != null && (
                <div><p className="text-xs text-gray-500">Permis depuis</p><p className="font-semibold">{v.anciennete_permis} an(s)</p></div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-gray-50">
              {regles.map(r => (
                <p key={r.l} className={`text-xs inline-flex items-center gap-1.5 ${r.ok ? "text-gray-700" : "text-gray-400"}`}>
                  {r.ok ? <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> : <Ban className="w-3.5 h-3.5" />}
                  {r.l} {r.ok ? "autorisé" : "non autorisé"}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* ── Colonne tarifs et demande ─────────────────────────────── */}
        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sticky top-4 space-y-3">
            <div>
              <p className="text-2xl font-bold text-blue-700">
                {v.prix_jour ? `${prixFr(v.prix_jour)} F` : "Sur demande"}
                {v.prix_jour && <span className="text-sm font-normal text-gray-500"> / jour</span>}
              </p>
              {v.statut === "disponible"
                ? <p className="text-xs text-green-700 font-medium">Disponible</p>
                : <p className="text-xs text-amber-700 font-medium">Nous consulter pour les disponibilités</p>}
            </div>

            {(grille.length > 0 || v.prix_semaine || v.prix_mois) && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1.5">Tarifs dégressifs</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {grille.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="text-gray-500">
                        {t.jour_max ? `${t.jour_min} à ${t.jour_max} jours` : `${t.jour_min} jours et +`}
                      </span>
                      <span className="font-semibold">{prixFr(t.prix_jour)} F/j</span>
                    </li>
                  ))}
                  {v.prix_semaine && (
                    <li className="flex justify-between gap-2">
                      <span className="text-gray-500">Semaine</span>
                      <span className="font-semibold">{prixFr(v.prix_semaine)} F</span>
                    </li>
                  )}
                  {v.prix_mois && (
                    <li className="flex justify-between gap-2">
                      <span className="text-gray-500">Mois</span>
                      <span className="font-semibold">{prixFr(v.prix_mois)} F</span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <DemandeReservation
              vehiculeId={v.id}
              titre={`${v.marque} ${v.modele}`}
              reference={v.reference}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
