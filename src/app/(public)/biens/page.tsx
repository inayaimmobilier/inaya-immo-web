import { Suspense } from "react"
import { TRANCHES_SURFACE, extraireSurfaceTerrain, usageTerrain } from "@/lib/terrain"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import PropertyCard from "@/components/properties/PropertyCard"
import PropertyFilters from "@/components/properties/PropertyFilters"
import Navbar from "@/components/shared/Navbar"
import AdSpace from "@/components/ads/AdComponents"
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
    /** Terrain : tranche de surface et usage (voir lib/terrain). */
    surface?: string
    usage?: string
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
  // ── LECTURE DE TOUT LE CATALOGUE, PAR PAGES ────────────────────────────────
  //
  // La requête se limitait aux 1 000 annonces les plus récentes (plafond
  // PostgREST, que `limit` ne relève pas) avant de filtrer en mémoire. Sur
  // 5 229 annonces publiées, 4 229 n'étaient donc atteignables par AUCUNE
  // recherche : Sakassou affichait « aucun résultat » alors que six biens y
  // existent, Toumodi 1 sur 10.
  //
  // Le filtrage par catégorie et par quartier s'appuie sur le TEXTE des
  // annonces (une « entrée couchée » classée « autre » est un logement) : le
  // porter en SQL fidèlement serait fragile. On lit donc tout, mais SANS les
  // médias — ils ne servent qu'aux douze annonces affichées, et les joindre
  // sur 5 000 lignes multiplierait le volume transféré par dix.
  const colonnes = "id,reference,titre,description,type_offre,categorie,prix,quartier,ville,statut,surface,nb_pieces,nb_chambres,nb_sdb,meuble,created_at,validated_at,zones(nom)"

  const villesDemandees = villeNom ? csv(villeNom).filter(Boolean) : []

  // Le constructeur est RECONSTRUIT à chaque page : un même objet requête
  // ré-`await`é après modification de sa plage est une source d'erreurs
  // silencieuses. Le tri secondaire sur `id` rend l'ordre total — sans lui,
  // deux annonces créées à la même seconde peuvent apparaître deux fois, ou
  // disparaître, à la frontière entre deux pages.
  const requete = () => {
    let q = supabase.from("properties")
      .select(colonnes)
      .eq("statut", "publie")
      .neq("type_offre", "residence_meublee")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
    if (params.type) q = q.eq("type_offre", params.type as never)
    // COMMUNE FILTRÉE EN BASE : les noms viennent du référentiel `villes`,
    // donc ils correspondent exactement à la colonne.
    if (villesDemandees.length > 0) q = q.in("ville", villesDemandees as never)
    return q
  }

  // Pagination explicite : `range` est le SEUL moyen de dépasser le millier.
  // La borne haute évite qu'un jour un bug de filtre ne déclenche une boucle
  // sans fin : au-delà, mieux vaut un résultat tronqué qu'une page qui ne
  // répond jamais.
  const PAS = 1000
  const PLAFOND = 20_000
  const toutes: unknown[] = []
  let error: { message: string } | null = null
  for (let debut = 0; debut < PLAFOND; debut += PAS) {
    const { data: lot, error: e } = await requete().range(debut, debut + PAS - 1)
    if (e) { error = e; break }
    const arr = (lot ?? []) as unknown[]
    toutes.push(...arr)
    if (arr.length < PAS) break
  }
  const data = toutes
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
  // Un code de type vient de la config admin : on l'échappe avant tout usage en regex.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  type Row = {
    reference?: number | null
    quartier?: string | null; ville?: string | null; titre?: string | null; description?: string | null
    categorie?: string | null; prix?: number | null; nb_pieces?: number | null; zones?: { nom?: string | null } | null
    /** Surface en m² — indispensable au filtrage des terrains. */
    surface?: number | null
  }
  // Concatène tous les champs texte pertinents d'une annonce. Inclut le numéro
  // d'annonce (référence) pour permettre la recherche par « N°1234 » ou « 1234 ».
  const hay = (r: Row) => [r.reference, r.quartier, r.ville, r.titre, r.description, r.zones?.nom, r.categorie].map(norm).join(" · ")

  let rows = (data ?? []) as (Row & { id: string })[]

  // Catégorie : « maison » est un terme GÉNÉRIQUE = toute habitation
  // (appartement, studio, villa, immeuble, duplex, chambre…). Les autres catégories
  // restent exactes, avec repli sur le titre si la colonne catégorie est vide.
  const RESIDENTIEL = ["maison", "appartement", "studio", "villa", "immeuble", "duplex", "chambre", "residence", "logement"]
  // Marqueurs d'HABITATION dans un titre. Au-delà des catégories, on reconnaît le
  // vocabulaire ivoirien : « chambre salon » (2 pièces), « entrée couchée » (1 pièce,
  // sanitaires communs — toutes graphies : entré couché, entrer coucher…).
  const reResid = new RegExp(`${RESIDENTIEL.join("|")}|entr[a-z]*[\\s-]*couch`)
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
      // Catégorie absente OU fourre-tout « autre » : on tranche sur le TITRE.
      // Les annonces ingérées depuis WhatsApp atterrissent souvent en « autre »
      // alors que ce sont des logements (vérifié : « Entrée couchée à louer… »
      // en categorie='autre'). Sans ça, une recherche « maison » les rate.
      if (!cat || cat === "autre") return reResid.test(norm(r.titre))
      return false
    }
    if (c === "local_commercial") {
      const cat = norm(r.categorie)
      if (COMMERCE_CATS.includes(cat)) return true
      return reCommerce.test(hay(r))
    }
    const cat = norm(r.categorie)
    if (cat === c) return true
    // Catégorie absente → repli sur le texte de l'annonce.
    if (!cat) return hay(r).includes(c)
    // SOUS-TYPE non stocké en base : l'admin propose des types (« villa »,
    // « entrepot ») qu'AUCUNE annonce ne porte en catégorie — une villa est
    // enregistrée en `maison` avec « Villa … » dans le TITRE. Sans ce repli, le
    // filtre « Villa » ne renvoyait jamais rien. On élargit donc au titre, mais
    // UNIQUEMENT à l'intérieur de la même famille : « Terrain de 800 m² avec
    // villa inachevée » est un TERRAIN et ne doit pas remonter comme une villa.
    const famille = RESIDENTIEL.includes(c) ? RESIDENTIEL : COMMERCE_CATS.includes(c) ? COMMERCE_CATS : null
    if (famille?.includes(cat)) return new RegExp(`\\b${escapeRe(c)}`).test(norm(r.titre))
    return false
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
  } else if (villesDemandees.length > 0) {
    // PLUSIEURS communes possibles (« Bouaké,Yamoussoukro ») : on garde une
    // annonce si elle correspond à AU MOINS UNE.
    const villes = villesDemandees.map(norm).filter(Boolean)

    // On compare la COLONNE `ville`, et elle seule.
    //
    // La comparaison portait avant sur tout le texte de l'annonce, description
    // comprise : « terrain sur l'axe Yamoussoukro-Sinfra » faisait remonter un
    // bien de Bouaké dans une recherche à Yamoussoukro. C'est précisément
    // l'erreur qu'on cherche à éliminer — proposer un bien d'une autre ville.
    //
    // L'ancien repli « garder les annonces sans commune » disparaît : mesuré
    // sur les 5 229 annonces publiées, AUCUNE n'a de commune vide. Il ne
    // protégeait plus de rien et laissait passer n'importe quoi.
    rows = rows.filter(r => {
      const v = norm(r.ville)
      return v ? villes.some(x => v.includes(x) || x.includes(v)) : false
    })
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

  // ── Terrains : surface et usage ─────────────────────────────────────────
  //
  // La surface manque sur un terrain sur cinq. On la relit alors dans le texte
  // (« 600 m² », « 3 hectares ») plutôt que d'écarter l'annonce : un bien exclu
  // faute de donnée est un bien invendu.
  if (params.surface) {
    const t = TRANCHES_SURFACE.find(x => x.cle === params.surface)
    if (t) rows = rows.filter(r => {
      const s = r.surface ?? extraireSurfaceTerrain(`${r.titre ?? ""} ${r.description ?? ""}`)
      if (s == null) return false
      if (t.min != null && s < t.min) return false
      if (t.max != null && s >= t.max) return false
      return true
    })
  }

  if (params.usage) {
    rows = rows.filter(r =>
      usageTerrain(`${r.titre ?? ""} ${r.description ?? ""}`, r.surface) === params.usage)
  }

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
  const visibles = rows.slice(from, to + 1)

  // ── MÉDIAS : chargés SEULEMENT pour les annonces affichées ─────────────────
  //
  // Les joindre à la requête principale les aurait ramenés pour les cinq mille
  // annonces lues, alors que douze au plus sont montrées. Une seule requête
  // supplémentaire, sur douze identifiants, coûte infiniment moins.
  const medias = new Map<string, unknown[]>()
  if (visibles.length > 0) {
    const { data: m } = await supabase
      .from("property_media")
      .select("property_id,url,type,ordre,thumbnail_url")
      .in("property_id", visibles.map(r => r.id))
      .order("ordre")
    for (const ligne of (m ?? []) as { property_id: string }[]) {
      const liste = medias.get(ligne.property_id) ?? []
      liste.push(ligne)
      medias.set(ligne.property_id, liste)
    }
  }
  const properties = visibles.map(r => ({ ...r, property_media: medias.get(r.id) ?? [] })) as unknown[]

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

          {/* Espaces publicitaires (page /biens) */}
          <AdSpace placement="biens" />

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
