import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import ContactActions from "./ContactActions"
import { formatPrix, CATEGORIE_LABEL, TYPE_OFFRE_LABEL } from "@/lib/utils"
import { ArrowLeft, MapPin, BedDouble } from "lucide-react"
import type { Database } from "@/types/database"

interface PageProps { params: Promise<{ id: string }> }

type Property = Database["public"]["Tables"]["properties"]["Row"] & {
  property_media?: Array<{ url: string; type: string; ordre: number; thumbnail_url: string | null }>
  zones?: { nom: string } | null
}

export const metadata = { title: "Contacter · Inaya Immo" }

export default async function ContacterPage({ params }: PageProps) {
  const { id } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from("properties")
    .select("*, property_media(url, type, ordre, thumbnail_url), zones(nom)")
    .eq("id", id)
    .eq("statut", "publie")
    .single()
  const property = data as Property | null
  if (!property) notFound()

  // Numéro de contact de la plateforme (annonces vérifiées → contact médié par Inaya).
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "contact_support").maybeSingle()
  const phone = ((setting as { value?: unknown } | null)?.value as string | undefined)?.trim() || null

  // Pré-remplissage du contact si l'utilisateur est connecté.
  let initialContact: { nom?: string | null; telephone?: string | null } | undefined
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: prof } = await admin.from("profiles").select("nom, telephone").eq("id", user.id).maybeSingle()
    const p = prof as { nom: string | null; telephone: string | null } | null
    const rawNom = p?.nom ?? (user.user_metadata?.nom as string | undefined) ?? null
    // N'affiche pas un e-mail comme « nom » (certains profils ont l'e-mail en nom).
    const nom = rawNom && !rawNom.includes("@") ? rawNom : null
    initialContact = { nom, telephone: p?.telephone ?? null }
  }

  // Référence lisible de l'annonce (dérivée de l'ID).
  const ref = `INA-${property.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.inaya.ci"
  const listingUrl = `${base}/biens/${property.id}`

  const message = `Bonjour, je suis intéressé par l'annonce N° ${ref} — « ${property.titre} »${property.quartier ? ` à ${property.quartier}` : ""}. Est-elle toujours disponible ?`

  const media = property.property_media ?? []
  const thumb = media.filter(m => m.type === "image").sort((a, b) => a.ordre - b.ordre)[0]?.url
    ?? media.find(m => m.type === "video" && m.thumbnail_url)?.thumbnail_url
    ?? null

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 space-y-5">
          <Link href={`/biens/${property.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700">
            <ArrowLeft className="w-4 h-4" /> Retour à l&apos;annonce
          </Link>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacter</h1>
            <p className="text-sm text-gray-500 mt-0.5">Annonce N° <span className="font-mono">{ref}</span></p>
          </div>

          {/* Message pré-rempli + boutons WhatsApp / Appel */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <ContactActions propertyId={property.id} phone={phone} initialMessage={message} listingUrl={listingUrl} initialContact={initialContact} />
          </div>

          {/* Détail de l'annonce */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Détail de l&apos;annonce</p>
            <div className="flex gap-3">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-gray-100 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <Link href={`/biens/${property.id}`} className="font-semibold text-gray-900 hover:text-blue-700 line-clamp-2">
                  {property.titre}
                </Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {property.quartier || "—"}</span>
                  {property.nb_pieces ? <span className="inline-flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {property.nb_pieces} p.</span> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{TYPE_OFFRE_LABEL[property.type_offre] ?? property.type_offre}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{CATEGORIE_LABEL[property.categorie] ?? property.categorie}</span>
                </div>
                {property.prix != null && (
                  <p className="mt-1.5 text-blue-700 font-bold">{formatPrix(property.prix)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
