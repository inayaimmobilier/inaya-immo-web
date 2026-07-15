import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import ContactForm from "./ContactForm"
import QuickContactButtons from "./QuickContactButtons"
import FavoriteButton from "./FavoriteButton"
import ReportButton from "./ReportButton"
import ShareButton from "./ShareButton"
import Gallery from "./Gallery"
import { isRealEmail } from "@/lib/account-actions"
import {
  formatPrix, formatDateTime, CATEGORIE_LABEL, TYPE_OFFRE_LABEL,
} from "@/lib/utils"
import { SITE_NAME, absoluteUrl } from "@/lib/site"
import {
  MapPin, BedDouble, Bath, Maximize2, Home, CheckCircle2, ArrowLeft, Tag, Layers, Sofa, Video, Clock,
} from "lucide-react"
import type { Database } from "@/types/database"

interface PageProps { params: Promise<{ id: string }> }

type Property = Database["public"]["Tables"]["properties"]["Row"] & {
  property_media?: Array<{ url: string; type: string; ordre: number; thumbnail_url: string | null; taille_bytes?: number | null }>
  zones?: { nom: string } | null
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const { data } = await createAdminClient()
    .from("properties")
    .select("titre, description, quartier, ville, prix, type_offre, categorie, statut, property_media(url, type, ordre, thumbnail_url)")
    .eq("id", id).eq("statut", "publie").single()
  const p = data as {
    titre: string; description: string | null; quartier: string | null; ville: string | null
    prix: number; type_offre: string; categorie: string
    property_media?: { url: string; type: string; ordre: number; thumbnail_url: string | null }[]
  } | null
  if (!p) return { title: "Annonce · Inaya Immo", robots: { index: false } }

  const lieu = [p.quartier, p.ville].filter(Boolean).join(", ") || "Bouaké"
  const offre = TYPE_OFFRE_LABEL[p.type_offre as keyof typeof TYPE_OFFRE_LABEL] ?? p.type_offre
  const cat = CATEGORIE_LABEL[p.categorie as keyof typeof CATEGORIE_LABEL] ?? p.categorie
  const desc = (p.description?.trim()
    || `${cat} en ${offre.toLowerCase()} à ${lieu}. ${formatPrix(p.prix)} FCFA. Annonce vérifiée par ${SITE_NAME}.`
  ).slice(0, 200)

  const media = (p.property_media ?? []).sort((a, b) => a.ordre - b.ordre)
  const cover = media.find(m => m.type === "image")?.url ?? media.find(m => m.thumbnail_url)?.thumbnail_url ?? null
  const canonical = `/biens/${id}`

  return {
    title: `${p.titre} · ${offre} à ${lieu}`,
    description: desc,
    alternates: { canonical },
    openGraph: {
      title: p.titre, description: desc, url: absoluteUrl(canonical),
      type: "article", siteName: SITE_NAME, locale: "fr_CI",
      images: cover ? [{ url: cover }] : undefined,
    },
    twitter: { card: "summary_large_image", title: p.titre, description: desc, images: cover ? [cover] : undefined },
  }
}

export default async function BienDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Lecture publique d'une annonce PUBLIÉE : on n'utilise pas la session du
  // visiteur (un cookie expiré ne doit pas provoquer un 404 sur une annonce
  // publique). Le filtre statut="publie" garantit qu'on n'expose que du public.
  const { data } = await createAdminClient()
    .from("properties")
    .select("*, property_media(url, type, ordre, thumbnail_url, taille_bytes), zones(nom)")
    .eq("id", id)
    .eq("statut", "publie")
    .single()
  const property = data as Property | null
  if (!property) notFound()

  // État favori + pré-remplissage du formulaire de contact pour l'utilisateur courant
  const { data: { user } } = await supabase.auth.getUser()
  let isFav = false
  let contactInitial: { nom?: string | null; telephone?: string | null; email?: string | null } | undefined
  if (user) {
    const [{ data: fav }, { data: profData }] = await Promise.all([
      supabase.from("favorites").select("property_id")
        .eq("user_id", user.id).eq("property_id", property.id).maybeSingle(),
      supabase.from("profiles").select("nom, telephone").eq("id", user.id).single(),
    ])
    isFav = !!fav
    const prof = profData as { nom: string | null; telephone: string | null } | null
    contactInitial = {
      nom: prof?.nom ?? null,
      telephone: prof?.telephone ?? null,
      // On ne pré-remplit que les vraies adresses (jamais l'e-mail interne synthétique)
      email: (await isRealEmail(user.email)) ? user.email : null,
    }
  }

  // Contact IMMÉDIAT (WhatsApp/appel) : numéro Inaya (mise en relation médiée —
  // coordonnées du propriétaire confidentielles) + message pré-rempli avec la réf.
  const { data: contactSetting } = await createAdminClient()
    .from("app_settings").select("value").eq("key", "contact_support").maybeSingle()
  const supportPhone = ((contactSetting as { value?: unknown } | null)?.value as string | undefined)?.trim() || null
  const refNum = (property as unknown as { reference?: number | null }).reference ?? null
  const refLabel = refNum != null ? String(refNum) : `INA-${property.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`
  const listingUrl = absoluteUrl(`/biens/${property.id}`)
  const quickMessage = `Bonjour, je suis intéressé par l'annonce N° ${refLabel} — « ${property.titre} »${property.quartier ? ` à ${property.quartier}` : ""}. Est-elle toujours disponible ?`

  // Déduplication des médias : un même fichier reposté sur WhatsApp est ré-uploadé
  // sous une URL R2 différente mais garde la MÊME taille → doublons visuels. On
  // dédoublonne par (type + taille) quand la taille est connue, sinon par URL.
  const dedupeMedia = <T extends { url: string; type: string; taille_bytes?: number | null }>(list: T[]): T[] => {
    const seen = new Set<string>()
    return list.filter(m => {
      const key = m.taille_bytes != null ? `${m.type}:${m.taille_bytes}` : `url:${m.url}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  }
  const allMedia = dedupeMedia((property.property_media ?? []).slice().sort((a, b) => a.ordre - b.ordre))
  const images = allMedia.filter(m => m.type === "image")
  const videos = allMedia.filter(m => m.type === "video")
  // Couverture : 1re photo, sinon miniature de la 1re vidéo (annonces vidéo-only)
  const coverUrl = images[0]?.url ?? videos.find(v => v.thumbnail_url)?.thumbnail_url ?? null
  const isLocation = property.type_offre === "location"
  const isCession  = property.type_offre === "cession"
  const isResidence = property.type_offre === "residence_meublee"
  const PERIODE_LABEL: Record<string, string> = { nuit: "par nuit", semaine: "par semaine", mois: "par mois" }
  const residPeriode = (property as unknown as { tarif_periode?: string | null }).tarif_periode
  const residDisponible = (property as unknown as { disponible?: boolean }).disponible !== false
  const cessionData = property as unknown as {
    cout_cession?: number | null
    loyer_cession?: number | null
    conditions_acquisition?: string | null
  }
  const prixM2 = (property as unknown as { prix_m2?: number | null }).prix_m2

  // Résidences : forfaits depuis la colonne dédiée ; repli sur la description (anciennes annonces).
  const forfaitsCol = (property as unknown as { forfaits?: string | null }).forfaits || null
  let descriptionAffichee = property.description
  let forfaits: string | null = forfaitsCol
  if (isResidence && !forfaits && property.description) {
    const m = property.description.match(/Forfaits?\s+sp[ée]ciaux\s*:\s*([\s\S]+)$/i)
    if (m) {
      forfaits = m[1].trim()
      descriptionAffichee = property.description.replace(/\n*\s*Forfaits?\s+sp[ée]ciaux\s*:[\s\S]*$/i, "").trim() || null
    }
  }

  const caracs = [
    property.nb_pieces != null && { icon: Layers, label: `${property.nb_pieces} pièce${property.nb_pieces > 1 ? "s" : ""}` },
    property.nb_chambres != null && { icon: BedDouble, label: `${property.nb_chambres} chambre${property.nb_chambres > 1 ? "s" : ""}` },
    property.nb_sdb != null && { icon: Bath, label: `${property.nb_sdb} salle${property.nb_sdb > 1 ? "s" : ""} de bain` },
    property.surface != null && { icon: Maximize2, label: `${property.surface} m²` },
    property.meuble && { icon: Sofa, label: "Meublé" },
  ].filter(Boolean) as { icon: typeof Home; label: string }[]

  // Conditions de location (caution / avance / agence) — biens en location/résidence.
  const cond = property as unknown as { mois_caution?: number | null; mois_avance?: number | null; mois_agence?: number | null }
  const conditionsLoc = [
    cond.mois_caution != null && { label: "Caution", value: `${cond.mois_caution} mois` },
    cond.mois_avance != null && { label: "Avance", value: `${cond.mois_avance} mois` },
    cond.mois_agence != null && { label: "Agence", value: `${cond.mois_agence} mois` },
    property.charges > 0 && { label: "Charges", value: `${formatPrix(property.charges)} FCFA` },
  ].filter(Boolean) as { label: string; value: string }[]

  // JSON-LD de l'annonce : décrit le bien de façon structurée pour Google
  // (rich results) et les assistants IA (données citables sans ambiguïté).
  const offreLabel = TYPE_OFFRE_LABEL[property.type_offre]
  const catLabel = CATEGORIE_LABEL[property.categorie]
  const lieuLabel = [property.quartier, property.ville].filter(Boolean).join(", ") || "Bouaké"
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: property.titre,
    description: (descriptionAffichee || `${catLabel} en ${offreLabel.toLowerCase()} à ${lieuLabel}.`).slice(0, 500),
    category: catLabel,
    image: images.map(i => i.url).slice(0, 6),
    url: absoluteUrl(`/biens/${property.id}`),
    offers: {
      "@type": "Offer",
      price: property.prix,
      priceCurrency: "XOF",
      availability: "https://schema.org/InStock",
      seller: { "@type": "RealEstateAgent", name: SITE_NAME },
    },
    ...(property.surface != null && { additionalProperty: [{ "@type": "PropertyValue", name: "Surface", value: `${property.surface} m²` }] }),
    areaServed: { "@type": "City", name: property.ville || "Bouaké" },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Link href="/biens" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Retour aux annonces
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Colonne principale */}
            <div className="lg:col-span-2 space-y-6">
              {/* Galerie interactive (image principale + miniatures cliquables) */}
              <Gallery
                images={images.length > 0 ? images : (coverUrl ? [{ url: coverUrl }] : [])}
                alt={property.titre}
                categorie={property.categorie}
                badges={
                  <>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full text-white ${
                      isResidence ? "bg-teal-600" : isLocation ? "bg-blue-600" : isCession ? "bg-purple-600" : "bg-amber-500"
                    }`}>
                      {TYPE_OFFRE_LABEL[property.type_offre]}
                    </span>
                    <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/90 text-gray-700">
                      {CATEGORIE_LABEL[property.categorie]}
                    </span>
                  </>
                }
              />

              {/* Vidéos */}
              {videos.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Video className="w-4 h-4 text-blue-600" /> Vidéo{videos.length > 1 ? "s" : ""}
                  </h2>
                  <div className="space-y-3">
                    {videos.map((v, i) => (
                      <video
                        key={i}
                        src={v.url}
                        poster={v.thumbnail_url ?? undefined}
                        controls
                        preload="none"
                        playsInline
                        className="w-full rounded-xl bg-black max-h-96"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Titre + prix */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    {(property as unknown as { reference?: number | null }).reference != null && (
                      <span className="inline-block mb-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-md px-2 py-0.5">
                        Annonce N°{(property as unknown as { reference: number }).reference}
                      </span>
                    )}
                    <h1 className="text-xl font-bold text-gray-900 mb-1">{property.titre}</h1>
                    <p className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin className="w-4 h-4" />
                      {property.quartier || property.zones?.nom || "Bouaké"} · {property.ville}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Publié le {formatDateTime(property.validated_at ?? property.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    {isCession ? (
                      <div>
                        <div className="text-xs text-purple-500 font-medium uppercase tracking-wide mb-0.5">Coût de cession</div>
                        <div className="text-2xl font-bold text-purple-700">{formatPrix(property.prix)}</div>
                        {cessionData.loyer_cession && (
                          <div className="text-sm text-gray-500 mt-1">
                            Loyer : <strong>{formatPrix(cessionData.loyer_cession)}</strong>/mois
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="text-2xl font-bold text-blue-700">{formatPrix(property.prix)}</div>
                        {isLocation && <div className="text-xs text-gray-400">par mois</div>}
                        {isResidence && <div className="text-xs text-gray-400">{PERIODE_LABEL[residPeriode ?? "mois"] ?? "par mois"}</div>}
                        {prixM2 && (
                          <div className="text-sm text-gray-500 mt-0.5">{formatPrix(prixM2)} / m²</div>
                        )}
                        {property.charges > 0 && (
                          <div className="text-xs text-gray-400">+ {formatPrix(property.charges)} de charges</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 className="w-4 h-4" /> Annonce vérifiée par Inaya
                  </div>
                  <div className="flex items-center gap-2">
                    <ShareButton title={property.titre} reference={(property as unknown as { reference?: number | null }).reference ?? null} />
                    <ReportButton propertyId={property.id} />
                    <FavoriteButton propertyId={property.id} initialActive={isFav} loggedIn={!!user} />
                  </div>
                </div>
              </div>

              {/* Caractéristiques */}
              {caracs.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-600" /> Caractéristiques
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {caracs.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-center gap-2 text-sm text-gray-700">
                        <Icon className="w-4 h-4 text-gray-400" /> {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions (caution / avance / agence) — location & résidences */}
              {(isLocation || isResidence) && conditionsLoc.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-600" /> Conditions
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {conditionsLoc.map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
                        <p className="text-sm font-medium text-gray-800">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Forfaits spéciaux (résidences) — mis en relief */}
              {isResidence && forfaits && (
                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-5">
                  <h2 className="text-sm font-bold text-teal-800 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-teal-600" /> Forfaits spéciaux
                  </h2>
                  <p className="text-sm text-teal-900 leading-relaxed whitespace-pre-line font-medium">{forfaits}</p>
                  <p className="text-[11px] text-teal-600 mt-2">Tarifs dégressifs proposés par le propriétaire — réservez via le formulaire.</p>
                </div>
              )}

              {/* Description */}
              {descriptionAffichee && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-2">Description</h2>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{descriptionAffichee}</p>
                </div>
              )}

              {/* Conditions de cession */}
              {isCession && (cessionData.loyer_cession || cessionData.conditions_acquisition) && (
                <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-purple-900 mb-4 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-purple-600" /> Conditions de cession
                  </h2>
                  <dl className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-purple-100">
                      <dt className="text-sm text-purple-700">Coût de cession</dt>
                      <dd className="text-sm font-semibold text-purple-900">{formatPrix(property.prix)}</dd>
                    </div>
                    {cessionData.loyer_cession && (
                      <div className="flex justify-between items-center py-2 border-b border-purple-100">
                        <dt className="text-sm text-purple-700">Loyer mensuel</dt>
                        <dd className="text-sm font-semibold text-purple-900">{formatPrix(cessionData.loyer_cession)}/mois</dd>
                      </div>
                    )}
                    {cessionData.conditions_acquisition && (
                      <div className="py-2">
                        <dt className="text-sm text-purple-700 mb-1.5">Conditions d&apos;acquisition</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-line leading-relaxed bg-white rounded-xl px-3 py-2.5">
                          {cessionData.conditions_acquisition}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>

            {/* Colonne latérale : mise en relation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-20">
                {isResidence && !residDisponible ? (
                  <div className="text-center py-4">
                    <p className="text-sm font-semibold text-gray-900">Résidence indisponible</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Cette résidence n&apos;est pas disponible à la réservation pour le moment.
                      Consultez nos autres résidences meublées.
                    </p>
                    <Link href="/residences" className="inline-block mt-3 text-sm text-teal-700 font-medium hover:text-teal-800">
                      Voir les résidences disponibles →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Contact immédiat : WhatsApp / Appel à propos de cette annonce */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-gray-900 text-sm">Contacter maintenant</h3>
                      <QuickContactButtons
                        propertyId={property.id} phone={supportPhone}
                        message={quickMessage} listingUrl={listingUrl}
                        contact={contactInitial}
                      />
                      <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                        Message ou appel à propos de l&apos;annonce N° {refLabel} — un agent Inaya vous répond.
                      </p>
                    </div>

                    {/* Séparateur « ou » */}
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-gray-100" />
                      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">ou</span>
                      <span className="h-px flex-1 bg-gray-100" />
                    </div>

                    <ContactForm propertyId={property.id} initial={contactInitial} isResidence={isResidence}
                    residence={isResidence ? { prix: property.prix, periode: residPeriode ?? "nuit", forfaits } : undefined} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs mt-8">
          © {new Date().getFullYear()} Inaya Immo · Bouaké, Côte d&apos;Ivoire
        </footer>
      </main>
    </>
  )
}
