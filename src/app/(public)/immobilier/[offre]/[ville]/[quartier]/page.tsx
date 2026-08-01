import Link from "next/link"
import { notFound } from "next/navigation"
import { MapPin, ArrowRight } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import PropertyCard from "@/components/properties/PropertyCard"
import { SITE_NAME, absoluteUrl } from "@/lib/site"
import { formatPrix } from "@/lib/utils"
import { OFFRES, cheminCombo, findCombo, voisins, type ZoneCombo } from "@/lib/zone-pages"

// Page d'atterrissage par quartier : le contenu bouge peu, on le met en cache
// une heure plutôt que de relire tout le catalogue à chaque visite.
export const revalidate = 3600

type Props = { params: Promise<{ offre: string; ville: string; quartier: string }> }

const SELECT =
  "*, property_media(url, type, ordre, thumbnail_url)"

/**
 * `ilike` (et non `eq`) pour ignorer la casse et les espaces de saisie, mais en
 * neutralisant `%` et `_` : sans cela un nom de quartier contenant l'un d'eux
 * deviendrait un joker et ramènerait des biens d'ailleurs.
 */
const litteral = (s: string) => s.replace(/[%_\\]/g, m => `\\${m}`)

async function annoncesDe(c: ZoneCombo) {
  const admin = createAdminClient()
  const { data } = await admin.from("properties")
    .select(SELECT)
    .eq("statut", "publie").eq("type_offre", c.offre)
    .ilike("ville", litteral(c.ville)).ilike("quartier", litteral(c.quartier))
    .order("created_at", { ascending: false }).limit(24)
  return (data ?? []) as never[]
}

export async function generateMetadata({ params }: Props) {
  const { offre, ville, quartier } = await params
  const c = await findCombo(offre, ville, quartier)
  if (!c) return { title: `Introuvable · ${SITE_NAME}`, robots: { index: false } }

  const o = OFFRES[c.offre]
  const titre = `${o.label} ${c.quartier}, ${c.ville} — ${c.total} annonce${c.total > 1 ? "s" : ""}`
  const description =
    `Biens ${o.titre} à ${c.quartier} (${c.ville}) : ${c.total} annonces vérifiées par ${SITE_NAME}. ` +
    `Maisons, appartements, studios et terrains — prix, photos et mise en relation par nos agents.`
  const url = absoluteUrl(cheminCombo(c))
  return {
    title: `${titre} · ${SITE_NAME}`,
    description,
    alternates: { canonical: cheminCombo(c) },
    openGraph: { title: titre, description, url, type: "website" as const },
  }
}

export default async function QuartierPage({ params }: Props) {
  const { offre, ville, quartier } = await params
  const c = await findCombo(offre, ville, quartier)
  if (!c) notFound()

  const [biens, autres] = await Promise.all([annoncesDe(c), voisins(c)])
  const o = OFFRES[c.offre]

  const prix = (biens as unknown as { prix: number | null }[])
    .map(b => b.prix).filter((p): p is number => typeof p === "number" && p > 0).sort((a, b) => a - b)
  const median = prix.length ? prix[Math.floor(prix.length / 2)] : null

  // Données structurées : une page de liste, pas une annonce isolée.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${o.label} à ${c.quartier}, ${c.ville}`,
    description: `Annonces ${o.titre} à ${c.quartier}.`,
    url: absoluteUrl(cheminCombo(c)),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absoluteUrl("/") },
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <nav className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-blue-700">Accueil</Link>
        <span>/</span>
        <Link href="/biens" className="hover:text-blue-700">Annonces</Link>
        <span>/</span>
        <span className="text-gray-700">{o.label} · {c.quartier}</span>
      </nav>

      <header className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {o.label} à {c.quartier}, {c.ville}
        </h1>
        <p className="text-gray-600 max-w-3xl leading-relaxed">
          {c.total} bien{c.total > 1 ? "s" : ""} {o.titre} {c.quartier === c.ville ? "" : `au quartier ${c.quartier}`} à {c.ville}
          {median ? `, autour de ${formatPrix(median)} FCFA${c.offre === "location" ? " par mois" : ""}` : ""}.
          Chaque annonce est vérifiée par un agent {SITE_NAME}, et la mise en relation passe par nous :
          les coordonnées du propriétaire restent confidentielles.
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <MapPin className="w-4 h-4" /> {c.quartier}, {c.ville}
        </div>
      </header>

      {biens.length === 0 ? (
        <p className="text-gray-500">Aucune annonce disponible pour le moment dans ce quartier.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {biens.map((b) => <PropertyCard key={(b as { id: string }).id} property={b} />)}
        </div>
      )}

      {c.total > biens.length && (
        <Link href={`/biens?type_offre=${c.offre}&quartier=${encodeURIComponent(c.quartier)}`}
          className="inline-flex items-center gap-2 text-blue-700 font-semibold hover:text-blue-800">
          Voir les {c.total} annonces de {c.quartier} <ArrowRight className="w-4 h-4" />
        </Link>
      )}

      {autres.length > 0 && (
        <section className="border-t border-gray-100 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {o.label} dans les autres quartiers de {c.ville}
          </h2>
          <div className="flex flex-wrap gap-2">
            {autres.map(v => (
              <Link key={cheminCombo(v)} href={cheminCombo(v)}
                className="text-sm bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 text-gray-700 hover:text-blue-800 rounded-full px-3.5 py-1.5 transition-colors">
                {v.quartier} <span className="text-gray-400">({v.total})</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
