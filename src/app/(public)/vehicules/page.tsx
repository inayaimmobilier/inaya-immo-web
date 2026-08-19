import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Car, Users, Fuel, Cog, MapPin, SlidersHorizontal } from "lucide-react"
import { TYPES_VEHICULE, CARBURANTS, BOITES } from "@/lib/vehicules"

export const metadata = {
  title: "Location de voitures à Bouaké · Inaya Immo",
  description:
    "Louez une voiture à Bouaké et Yamoussoukro : citadines, berlines, 4x4, utilitaires. Tarifs à la journée, à la semaine ou au mois, avec ou sans chauffeur.",
}
export const dynamic = "force-dynamic"

interface Recherche {
  type?: string
  ville?: string
  carburant?: string
  boite?: string
  places?: string
  prixMax?: string
}

interface Ligne {
  id: string
  reference: number | null
  marque: string
  modele: string
  type_vehicule: string
  carburant: string | null
  boite: string | null
  nb_places: number | null
  prix_jour: number | null
  prix_semaine: number | null
  ville: string | null
  quartier: string | null
  statut: string
}

const prixFr = (n: number) => n.toLocaleString("fr-FR")

export default async function CatalogueVehicules(
  { searchParams }: { searchParams: Promise<Recherche> },
) {
  const q = await searchParams
  const db = createAdminClient()

  // Lecture par la VUE publique : elle ne contient ni VIN, ni traceur, ni
  // notes internes. Interroger la table directement obligerait à énumérer les
  // colonnes sûres à chaque requête, et un seul oubli suffirait à tout exposer.
  let req = db.from("vehicules_publics")
    .select("id,reference,marque,modele,type_vehicule,carburant,boite,nb_places," +
            "prix_jour,prix_semaine,ville,quartier,statut")
    .neq("statut", "archive")
    .order("prix_jour", { ascending: true, nullsFirst: false })

  if (q.type) req = req.eq("type_vehicule", q.type)
  if (q.ville) req = req.ilike("ville", q.ville)
  if (q.carburant) req = req.eq("carburant", q.carburant)
  if (q.boite) req = req.eq("boite", q.boite)
  if (q.places) req = req.gte("nb_places", Number(q.places))
  if (q.prixMax) req = req.lte("prix_jour", Number(q.prixMax))

  const { data, error } = await req
  const vehicules = (data ?? []) as Ligne[]

  // Vignettes en une seule requête.
  const vignettes = new Map<string, string>()
  if (vehicules.length) {
    const { data: photos } = await db.from("vehicule_photos")
      .select("vehicule_id,url,principale,ordre")
      .in("vehicule_id", vehicules.map(v => v.id)).order("ordre")
    for (const p of (photos ?? []) as { vehicule_id: string; url: string; principale: boolean }[]) {
      if (p.principale || !vignettes.has(p.vehicule_id)) vignettes.set(p.vehicule_id, p.url)
    }
  }

  const villes = [...new Set(vehicules.map(v => v.ville).filter(Boolean))] as string[]
  const lien = (patch: Partial<Recherche>) => {
    const p = new URLSearchParams()
    const suivant = { ...q, ...patch }
    for (const [k, val] of Object.entries(suivant)) if (val) p.set(k, String(val))
    const s = p.toString()
    return s ? `/vehicules?${s}` : "/vehicules"
  }
  const actif = (cle: keyof Recherche, val: string) => q[cle] === val

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Car className="w-7 h-7 text-blue-600" /> Location de voitures
        </h1>
        <p className="text-sm text-gray-600">
          Citadines, berlines, 4x4 et utilitaires à Bouaké et Yamoussoukro.
          Réservez à la journée, à la semaine ou au mois.
        </p>
      </header>

      {/* ── Filtres ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Affiner
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Link href={lien({ type: "" })}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
              !q.type ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
            Tous les types
          </Link>
          {TYPES_VEHICULE.map(t => (
            <Link key={t.v} href={lien({ type: actif("type", t.v) ? "" : t.v })}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                actif("type", t.v) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
              {t.l}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BOITES.map(b => (
            <Link key={b.v} href={lien({ boite: actif("boite", b.v) ? "" : b.v })}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                actif("boite", b.v) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
              Boîte {b.l.toLowerCase()}
            </Link>
          ))}
          {CARBURANTS.slice(0, 4).map(c => (
            <Link key={c.v} href={lien({ carburant: actif("carburant", c.v) ? "" : c.v })}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                actif("carburant", c.v) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
              {c.l}
            </Link>
          ))}
          {villes.map(ville => (
            <Link key={ville} href={lien({ ville: actif("ville", ville) ? "" : ville })}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                actif("ville", ville) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
              {ville}
            </Link>
          ))}
        </div>
      </div>

      {/* Table absente = migration non appliquée. On le dit plutôt que
          d'afficher « aucun véhicule », qui ferait chercher au mauvais endroit. */}
      {error && (error.code === "42P01" || error.code === "PGRST205") ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
          Le catalogue de véhicules n&apos;est pas encore activé sur ce serveur.
        </p>
      ) : vehicules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center space-y-3">
          <Car className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-600">
            Aucun véhicule ne correspond à cette recherche pour le moment.
          </p>
          <Link href="/vehicules" className="text-sm text-blue-600 hover:underline">
            Voir tous les véhicules
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicules.map(v => (
            <Link key={v.id} href={`/vehicules/${v.id}`}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-44 bg-gray-100 flex items-center justify-center">
                {vignettes.get(v.id)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={vignettes.get(v.id)} alt={`${v.marque} ${v.modele}`}
                      className="w-full h-full object-cover" />
                  : <Car className="w-10 h-10 text-gray-300" />}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-gray-900">{v.marque} {v.modele}</h2>
                  {v.statut === "disponible" && (
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-green-50 text-green-700 shrink-0">
                      Disponible
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  {v.nb_places && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{v.nb_places} places</span>}
                  {v.boite && <span className="inline-flex items-center gap-1"><Cog className="w-3 h-3" />{BOITES.find(b => b.v === v.boite)?.l}</span>}
                  {v.carburant && <span className="inline-flex items-center gap-1"><Fuel className="w-3 h-3" />{CARBURANTS.find(c => c.v === v.carburant)?.l}</span>}
                </div>
                {v.ville && (
                  <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {v.ville}{v.quartier ? ` · ${v.quartier}` : ""}
                  </p>
                )}
                <p className="text-lg font-bold text-blue-700">
                  {v.prix_jour ? `${prixFr(v.prix_jour)} F` : "Prix sur demande"}
                  {v.prix_jour && <span className="text-xs font-normal text-gray-500"> / jour</span>}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center space-y-2">
        <p className="text-sm font-semibold text-blue-900">Vous possédez un véhicule ?</p>
        <p className="text-xs text-blue-800">
          Confiez-le nous : nous trouvons les locataires, vous fixez vos tarifs.
        </p>
        <Link href="/devenir-loueur"
          className="inline-block bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
          Proposer mon véhicule
        </Link>
      </div>
    </div>
  )
}
