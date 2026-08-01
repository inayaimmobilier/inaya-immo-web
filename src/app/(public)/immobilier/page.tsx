import Link from "next/link"
import { SITE_NAME, absoluteUrl } from "@/lib/site"
import { OFFRES, allCombos, cheminCombo, type OffreKey } from "@/lib/zone-pages"

export const revalidate = 3600

export async function generateMetadata() {
  const titre = `Immobilier par quartier à Bouaké et Yamoussoukro`
  return {
    title: `${titre} · ${SITE_NAME}`,
    description:
      "Trouvez un bien quartier par quartier : location et vente à Air France, Belleville, " +
      "Broukro, Kennedy, Gonfreville, Morofé et partout ailleurs. Annonces vérifiées par Inaya Immo.",
    alternates: { canonical: "/immobilier" },
    openGraph: { title: titre, url: absoluteUrl("/immobilier"), type: "website" as const },
  }
}

export default async function IndexQuartiers() {
  const combos = await allCombos()

  // Regroupement ville → offre → quartiers, pour une lecture naturelle.
  const villes = new Map<string, Map<OffreKey, typeof combos>>()
  for (const c of combos) {
    if (!villes.has(c.ville)) villes.set(c.ville, new Map())
    const parOffre = villes.get(c.ville)!
    parOffre.set(c.offre, [...(parOffre.get(c.offre) ?? []), c])
  }
  const villesTriees = [...villes.entries()]
    .map(([ville, m]) => ({ ville, m, total: [...m.values()].flat().reduce((s, c) => s + c.total, 0) }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Immobilier quartier par quartier</h1>
        <p className="text-gray-600 max-w-3xl leading-relaxed">
          Parcourez les annonces vérifiées d&apos;{SITE_NAME} là où vous cherchez vraiment :
          par commune, par quartier et par type d&apos;opération.
        </p>
      </header>

      {villesTriees.map(({ ville, m }) => (
        <section key={ville} className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">{ville}</h2>
          {([...m.entries()] as [OffreKey, typeof combos][])
            .sort((a, b) => b[1].length - a[1].length)
            .map(([offre, liste]) => (
              <div key={offre} className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500">{OFFRES[offre].label}</h3>
                <div className="flex flex-wrap gap-2">
                  {liste.sort((a, b) => b.total - a.total).map(c => (
                    <Link key={cheminCombo(c)} href={cheminCombo(c)}
                      className="text-sm bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 text-gray-700 hover:text-blue-800 rounded-full px-3.5 py-1.5 transition-colors">
                      {c.quartier} <span className="text-gray-400">({c.total})</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </section>
      ))}
    </div>
  )
}
