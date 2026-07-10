import { Suspense } from "react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import PropertyCard from "@/components/properties/PropertyCard"
import PropertyFilters from "@/components/properties/PropertyFilters"
import Navbar from "@/components/shared/Navbar"
import SaveSearchButton from "./SaveSearchButton"
import SaveSearchLink from "./SaveSearchLink"
import AutoRefresh from "@/components/shared/AutoRefresh"
import { LayoutGrid, List, ChevronLeft, ChevronRight } from "lucide-react"

// Données temps réel (ingestion WhatsApp) : jamais de cache, toujours frais.
export const dynamic = "force-dynamic"

const PER_PAGE = 12

interface PageProps {
  searchParams: Promise<{
    type?: string
    categorie?: string
    quartier?: string
    quartier_id?: string   // depuis HomeSearch (UUID → résolu en nom)
    ville?: string
    ville_id?: string      // depuis HomeSearch (UUID → résolu en nom)
    prix_min?: string
    prix_max?: string
    pieces_min?: string
    q?: string
    page?: string
  }>
}

export const metadata = {
  title: "Annonces immobilières à Bouaké",
  description: "Trouvez des maisons, appartements, studios et terrains à louer ou à vendre à Bouaké.",
}

async function PropertiesList({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const page = Number(params.page) || 1
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  // Résolution ville_id / quartier_id (UUID de HomeSearch) → nom texte.
  // IMPORTANT : via le client ADMIN — les tables de référence quartiers/villes
  // ne sont pas lisibles par le client anonyme (RLS), sinon la résolution
  // renverrait null et le filtre commune/quartier serait silencieusement ignoré.
  const refDb = createAdminClient()
  const csv = (s?: string) => (s ? s.split(",").map(x => x.trim()).filter(Boolean) : [])

  // Quartiers : plusieurs possibles (noms séparés par des virgules), + repli sur
  // des quartier_id (UUID) hérités de HomeSearch, résolus en noms via le client admin.
  const quartierNoms: string[] = csv(params.quartier)
  if (!quartierNoms.length && params.quartier_id) {
    const ids = csv(params.quartier_id)
    const { data: qRows } = await refDb.from("quartiers").select("nom").in("id", ids)
    for (const r of (qRows ?? []) as { nom: string }[]) if (r.nom) quartierNoms.push(r.nom)
  }

  let villeNom = params.ville || null
  if (!villeNom && params.ville_id) {
    const { data: vRow } = await refDb
      .from("villes").select("nom").eq("id", params.ville_id).single()
    villeNom = (vRow as { nom: string } | null)?.nom ?? null
  }

  // Types de biens (catégories) : plusieurs possibles.
  const categorieList = csv(params.categorie)

  // Filtres STRUCTURÉS en base (type, catégorie, prix, pièces). La commune/quartier
  // et la recherche texte sont appariés ensuite en JS avec normalisation (accents +
  // casse + multi-champs), car les annonces ingérées par l'IA utilisent des libellés
  // libres (« Bouake » sans accent, quartier dans le titre plutôt que la colonne…).
  // Les résidences meublées ont leur propre catalogue (/residences) → exclues d'ici.
  let dataQ = supabase.from("properties")
    .select("id,reference,titre,description,type_offre,categorie,prix,quartier,ville,statut,surface,nb_pieces,nb_chambres,nb_sdb,meuble,created_at,validated_at,property_media(url,type,ordre,thumbnail_url),zones(nom)")
    .eq("statut", "publie")
    .neq("type_offre", "residence_meublee")
    .order("created_at", { ascending: false })
    .limit(1000)

  if (params.type) dataQ = dataQ.eq("type_offre", params.type as never)

  const { data, error } = await dataQ
  if (error) {
    console.error("INAYA-DB-001", error)
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg mb-2">Impossible de charger les annonces.</p>
        <p className="text-sm">Veuillez réessayer dans quelques instants.</p>
      </div>
    )
  }

  // Normalisation : minuscules + suppression des accents. « Bouaké » → « bouake ».
  const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  type Row = {
    reference?: number | null
    quartier?: string | null; ville?: string | null; titre?: string | null; description?: string | null
    categorie?: string | null; prix?: number | null; nb_pieces?: number | null; zones?: { nom?: string | null } | null
  }
  // Concatène tous les champs texte pertinents d'une annonce. Inclut le numéro
  // d'annonce (référence) pour permettre la recherche par « N°1234 » ou « 1234 ».
  const hay = (r: Row) => [r.reference, r.quartier, r.ville, r.titre, r.description, r.zones?.nom, r.categorie].map(norm).join(" · ")

  let rows = (data ?? []) as (Row & { id: string })[]

  // Catégorie : « maison » est un terme GÉNÉRIQUE = toute habitation
  // (appartement, studio, villa, immeuble, duplex, chambre…). Les autres catégories
  // restent exactes, avec repli sur le titre si la colonne catégorie est vide.
  const RESIDENTIEL = ["maison", "appartement", "studio", "villa", "immeuble", "duplex", "chambre", "residence", "logement"]
  const reResid = new RegExp(RESIDENTIEL.join("|"))
  // « Local / espace commercial » est GÉNÉRIQUE : tout petit commerce à céder ou
  // à louer (cave, salon de coiffure, quincaillerie, salle de jeux, kiosque,
  // maquis, lavage auto, pressing, restaurant, gargote, boulangerie, garage,
  // point mobile money, boutique, cyber café, bar…) relève de cette catégorie.
  const COMMERCE_CATS = ["local_commercial", "magasin", "boutique", "bureau", "commerce", "entrepot"]
  // Mots-clés commerciaux SPÉCIFIQUES. « salon » et « bar » seuls sont ambigus
  // (« chambre salon » = séjour d'un logement) → bornés par \b (mot entier) pour
  // ne matcher que « salon de coiffure », « bar » isolé, etc., pas « chambre salon ».
  const reCommerce = /local commercial|magasin|boutique|commerce|restaurant|maquis|coiffure|quincaillerie|blanchisserie|pressing|mobile money|kiosque|superette|supermarche|pharmacie|atelier|entrepot|fonds de commerce|pas de porte|salle de jeux|lavage auto|gargote|garbadrome|boulangerie|cyber ?caf|\bcave\b|\bgarage\b|\bbar\b/
  // Vrai si l'annonce correspond à UNE catégorie recherchée (générique pour maison/commerce).
  const catMatch = (r: Row, c: string) => {
    if (c === "maison") {
      const cat = norm(r.categorie)
      if (RESIDENTIEL.includes(cat)) return true
      if (!cat) return reResid.test(norm(r.titre))
      return false
    }
    if (c === "local_commercial") {
      const cat = norm(r.categorie)
      if (COMMERCE_CATS.includes(cat)) return true
      return reCommerce.test(hay(r))
    }
    return norm(r.categorie) === c || (!norm(r.categorie) && hay(r).includes(c))
  }
  // Plusieurs types possibles → l'annonce passe si elle correspond à AU MOINS UN.
  if (categorieList.length) {
    const cats = categorieList.map(norm)
    rows = rows.filter(r => cats.some(c => catMatch(r, c)))
  }

  if (quartierNoms.length) {
    // Plusieurs quartiers possibles → match si l'annonce correspond à AU MOINS UN.
    // Recall élevé : on cherche chaque libellé dans tous les champs (titre/description…).
    const qs = quartierNoms.map(norm)
    rows = rows.filter(r => { const h = hay(r); return qs.some(q => h.includes(q)) })
  } else if (villeNom) {
    // Commune seule : match sur la commune ; on garde aussi les annonces sans commune
    // renseignée pour éviter les faux négatifs (dataset quasi mono-ville).
    const t = norm(villeNom)
    rows = rows.filter(r => hay(r).includes(t) || !norm(r.ville))
  }
  if (params.q) {
    const t = norm(params.q)
    // Recherche par NUMÉRO d'annonce : « N°1234 », « no 1234 », « #1234 », « 1234 ».
    const numPart = t.replace(/^n[°o]?\s*|^#\s*|^numero\s*/, "").trim()
    const asRef = /^\d+$/.test(numPart) ? Number(numPart) : null
    if (asRef != null) rows = rows.filter(r => r.reference === asRef || hay(r).includes(t))
    else if (t) rows = rows.filter(r => hay(r).includes(t))
  }

  // Prix / pièces : TOLÉRANTS aux valeurs manquantes. L'IA n'extrait pas toujours le
  // loyer ou le nombre de pièces ; on n'exclut donc pas une annonce dont la donnée est
  // inconnue (null) — sinon on génère de faux « aucune annonce ».
  if (params.prix_min)   { const n = Number(params.prix_min);   rows = rows.filter(r => r.prix == null || Number(r.prix) >= n) }
  if (params.pieces_min) { const n = Number(params.pieces_min); rows = rows.filter(r => r.nb_pieces == null || Number(r.nb_pieces) >= n) }

  // Budget : si AUCUNE annonce n'entre exactement dans le budget, on propose des
  // biens légèrement au-dessus (jusqu'à +25 %) au lieu d'un « aucune annonce ».
  let budgetSuggestion: { budget: number; plafond: number } | null = null
  const maxN = params.prix_max ? Number(params.prix_max) : null
  if (maxN != null && !Number.isNaN(maxN)) {
    const within = rows.filter(r => r.prix == null || Number(r.prix) <= maxN)
    if (within.length > 0) {
      rows = within
    } else if (rows.length > 0) {
      const plafond = Math.round(maxN * 1.25)
      const above = rows
        .filter(r => r.prix != null && Number(r.prix) <= plafond)
        .sort((a, b) => Number(a.prix) - Number(b.prix))
      if (above.length > 0) { rows = above; budgetSuggestion = { budget: maxN, plafond } }
      else rows = within // rien même à +25 % → aucune annonce
    } else {
      rows = within
    }
  }

  const total = rows.length
  const totalPages = Math.ceil(total / PER_PAGE)
  const properties = rows.slice(from, to + 1) as unknown[]

  if (!properties || properties.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4">🏠</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune annonce trouvée</h3>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Aucun bien ne correspond à vos critères pour l&apos;instant.
          Nous vous alerterons dès qu&apos;un bien correspondant sera disponible.
        </p>
        <Suspense>
          <SaveSearchLink />
        </Suspense>
      </div>
    )
  }

  const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`

  return (
    <>
      {budgetSuggestion ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucune annonce exactement dans votre budget de <strong>{fcfa(budgetSuggestion.budget)}</strong>.
          Voici <strong>{total}</strong> bien{total > 1 ? "s" : ""} légèrement au-dessus (jusqu&apos;à <strong>{fcfa(budgetSuggestion.plafond)}</strong>, +25 %).
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-semibold text-gray-900">{total}</span> annonce{total > 1 ? "s" : ""} trouvée{total > 1 ? "s" : ""}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(properties as { id: string }[]).map((p) => (
          <PropertyCard key={p.id} property={p as never} />
        ))}
      </div>

      {/* Pagination compacte (fenêtre autour de la page courante + Préc./Suiv.).
          Sur mobile, on n'affiche JAMAIS toutes les pages : seulement 1 … n-1 [n] n+1 … N. */}
      {totalPages > 1 && (() => {
        const pageUrl = (p: number) => `/biens?${new URLSearchParams({ ...params, page: String(p) })}`
        // Construit la liste des pages à afficher avec des « … ».
        const nums: (number | "…")[] = []
        const push = (p: number) => { if (!nums.includes(p)) nums.push(p) }
        push(1)
        for (let p = page - 1; p <= page + 1; p++) if (p > 1 && p < totalPages) { if (nums[nums.length - 1] !== "…" && p - (nums[nums.length - 1] as number) > 1) nums.push("…"); push(p) }
        if (totalPages > 1) { if (nums[nums.length - 1] !== "…" && totalPages - (nums[nums.length - 1] as number) > 1) nums.push("…"); push(totalPages) }
        const cell = "min-w-9 h-9 px-2 flex items-center justify-center rounded-xl text-sm font-medium transition-colors"
        return (
          <div className="flex flex-wrap justify-center items-center gap-1.5 mt-10">
            {/* Précédent */}
            {page > 1 ? (
              <a href={pageUrl(page - 1)} aria-label="Page précédente"
                className={`${cell} bg-white border border-gray-200 text-gray-600 hover:border-blue-300`}>
                <ChevronLeft className="w-4 h-4" />
              </a>
            ) : (
              <span className={`${cell} bg-gray-50 border border-gray-100 text-gray-300 cursor-not-allowed`}><ChevronLeft className="w-4 h-4" /></span>
            )}

            {nums.map((p, i) => p === "…" ? (
              <span key={`e${i}`} className="w-6 text-center text-gray-400 select-none">…</span>
            ) : (
              <a key={p} href={pageUrl(p)}
                className={`${cell} ${p === page ? "bg-blue-700 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"}`}>
                {p}
              </a>
            ))}

            {/* Suivant */}
            {page < totalPages ? (
              <a href={pageUrl(page + 1)} aria-label="Page suivante"
                className={`${cell} bg-white border border-gray-200 text-gray-600 hover:border-blue-300`}>
                <ChevronRight className="w-4 h-4" />
              </a>
            ) : (
              <span className={`${cell} bg-gray-50 border border-gray-100 text-gray-300 cursor-not-allowed`}><ChevronRight className="w-4 h-4" /></span>
            )}
          </div>
        )
      })()}
    </>
  )
}

export default async function BiensPage({ searchParams }: PageProps) {
  const params = await searchParams
  const typeLabel = params.type === "location" ? "Location" : params.type === "vente" ? "Vente" : "Toutes les annonces"

  return (
    <>
      <AutoRefresh intervalMs={60_000} />
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        {/* En-tête */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{typeLabel}</h1>
            <p className="text-sm text-gray-500">Bouaké & environs · Annonces vérifiées</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Filtres */}
          <Suspense>
            <PropertyFilters />
          </Suspense>

          {/* Barre d'outils */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              <button className="p-2 bg-white border border-gray-200 rounded-xl text-blue-700 shadow-sm">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button className="p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-gray-600">
                <List className="w-4 h-4" />
              </button>
            </div>
            <SaveSearchButton params={params} />
          </div>

          {/* Liste */}
          <Suspense
            fallback={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl h-72 animate-pulse border border-gray-100" />
                ))}
              </div>
            }
          >
            <PropertiesList searchParams={Promise.resolve(params)} />
          </Suspense>
        </div>
      </main>
    </>
  )
}
