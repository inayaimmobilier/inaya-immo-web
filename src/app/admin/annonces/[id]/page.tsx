import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import SignalementsPanel from "./SignalementsPanel"
import {
  ArrowLeft, Users, Copy, Star, Phone, User, MessageSquare, Globe, Star as StarIcon, Images, Smartphone,
} from "lucide-react"
import { formatPrix, formatDate, CATEGORIE_LABEL, TYPE_OFFRE_LABEL, STATUT_LABEL } from "@/lib/utils"
import type { UserRole, Canal } from "@/types/database"
import MergeCandidate from "./MergeCandidate"
import MediaSection from "./MediaSection"
import PropertyEditForm from "./PropertyEditForm"

export const metadata = { title: "Détail annonce · Inaya Immo" }

interface PageProps { params: Promise<{ id: string }> }

interface Prop {
  id: string; titre: string; description: string | null; type_offre: "location" | "vente" | "cession"
  categorie: keyof typeof CATEGORIE_LABEL; prix: number; prix_m2: number | null; quartier: string | null; ville: string
  statut: string; dedup_status: string; publishers_count: number; created_at: string
  mois_caution: number | null; mois_avance: number | null; mois_agence: number | null
  cout_cession: number | null; loyer_cession: number | null; conditions_acquisition: string | null
}
interface MediaRow {
  id: string; type: "image" | "video"; url: string; ordre: number
}
interface Publisher {
  id: string; rang: number; est_original: boolean; canal: Canal
  contact_nom: string | null; contact_phone: string | null; publisher_id: string | null
  group_nom: string | null; publie_le: string
}
interface Candidate {
  candidate_id: string; titre: string; prix: number; statut: string; score: number
}

const SOURCE_BADGE: Record<string, { label: (groupNom: string | null) => string; cls: string; Icon: typeof Globe }> = {
  whatsapp: {
    label: (g) => g ? `Groupe : ${g}` : "WhatsApp",
    cls: "bg-green-50 text-green-700 border border-green-100",
    Icon: MessageSquare,
  },
  web: {
    label: () => "Site web Inaya",
    cls: "bg-blue-50 text-blue-700 border border-blue-100",
    Icon: Globe,
  },
  app: {
    label: () => "Application Inaya",
    cls: "bg-indigo-50 text-indigo-700 border border-indigo-100",
    Icon: Smartphone,
  },
  interne: {
    label: () => "Ajout interne (staff)",
    cls: "bg-gray-100 text-gray-600 border border-gray-200",
    Icon: Users,
  },
}

export default async function AdminBienDetail({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/connexion?redirect=/admin/annonces/${id}`)
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (!["super_admin", "admin", "moderateur", "agent"].includes(myRole)) redirect("/")
  // Le numéro de l'annonceur/propriétaire est réservé aux administrateurs :
  // agents et modérateurs ne le voient pas (protection de la commission Inaya —
  // empêche un agent de contacter le propriétaire en direct).
  const canSeeOwnerPhone = ["super_admin", "admin"].includes(myRole)

  const { data: propData } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id).single()
  const prop = propData as Prop | null
  if (!prop) notFound()

  const [{ data: pubData }, { data: candData }, { data: mediaData }] = await Promise.all([
    supabase.from("property_publishers")
      .select("id,rang,est_original,canal,contact_nom,contact_phone,publisher_id,group_nom,publie_le")
      .eq("property_id", id).order("rang", { ascending: true }),
    supabase.rpc("find_property_duplicates" as never, { p_property_id: id } as never),
    supabase.from("property_media")
      .select("id,type,url,ordre")
      .eq("property_id", id).order("ordre", { ascending: true }),
  ])
  const publishers = (pubData ?? []) as Publisher[]
  const candidates = ((candData ?? []) as Candidate[]).filter(c => c.candidate_id)
  const medias = (mediaData ?? []) as MediaRow[]

  // Signalements ouverts (résilient si migration 031 non appliquée → aucun).
  type SigRow = { id: string; categorie: string | null; motif: string | null; contact: string | null; created_at: string }
  let signalements: SigRow[] = []
  {
    const admin = createAdminClient()
    const { data: sigData, error: sigErr } = await admin
      .from("signalements")
      .select("id,categorie,motif,contact,created_at")
      .eq("property_id", id).eq("statut", "nouveau")
      .order("created_at", { ascending: false })
    if (!sigErr && sigData) signalements = sigData as SigRow[]
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/annonces" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux annonces
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{prop.titre}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {TYPE_OFFRE_LABEL[prop.type_offre]} · {CATEGORIE_LABEL[prop.categorie]} · {prop.quartier ?? prop.ville} · {formatPrix(prop.prix)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {prop.dedup_status === "canonical" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                <Star className="w-3 h-3" /> Canonical
              </span>
            )}
            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
              {STATUT_LABEL[prop.statut] ?? prop.statut}
            </span>
          </div>
        </div>
      </div>

      {/* Signalements — mis en avant en rouge pour traitement rapide */}
      {signalements.length > 0 && (
        <SignalementsPanel propertyId={prop.id} reports={signalements} />
      )}

      {/* Édition + changement de statut */}
      <PropertyEditForm
        propertyId={prop.id}
        initial={{
          titre: prop.titre,
          description: prop.description,
          type_offre: prop.type_offre,
          categorie: prop.categorie,
          prix: prop.prix,
          prix_m2: (prop as unknown as { prix_m2?: number | null }).prix_m2 ?? null,
          quartier: prop.quartier,
          ville: prop.ville,
          statut: prop.statut,
          // Colonnes ajoutées en migration 010 — null si migration non appliquée
          mois_caution: (prop as unknown as { mois_caution?: number | null }).mois_caution ?? null,
          mois_avance:  (prop as unknown as { mois_avance?:  number | null }).mois_avance  ?? null,
          mois_agence:  (prop as unknown as { mois_agence?:  number | null }).mois_agence  ?? null,
          // Colonnes cession ajoutées en migration 014
          cout_cession:           (prop as unknown as { cout_cession?: number | null }).cout_cession ?? null,
          loyer_cession:          (prop as unknown as { loyer_cession?: number | null }).loyer_cession ?? null,
          conditions_acquisition: (prop as unknown as { conditions_acquisition?: string | null }).conditions_acquisition ?? null,
          // Colonnes résidence (migrations 020/023)
          tarif_periode: (prop as unknown as { tarif_periode?: string | null }).tarif_periode ?? null,
          forfaits:      (prop as unknown as { forfaits?: string | null }).forfaits ?? null,
        }}
      />

      {/* Publieurs ordonnés */}
      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Publieurs</h2>
          <span className="text-xs text-gray-400">({prop.publishers_count})</span>
        </div>
        {publishers.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-6">
            Aucun publieur enregistré. Les publieurs sont ajoutés à l&apos;ingestion WhatsApp ou lors d&apos;une fusion.
          </p>
        ) : (
          <ol className="divide-y divide-gray-50">
            {publishers.map(p => {
              const nom = p.contact_nom || (p.publisher_id ? "Agent (compte interne)" : "Inconnu")
              const badge = SOURCE_BADGE[p.canal] ?? {
                label: () => p.canal, cls: "bg-gray-100 text-gray-600 border border-gray-200", Icon: Globe,
              }
              const BadgeIcon = badge.Icon
              return (
                <li key={p.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {p.rang}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Nom + badge 1er publieur */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{nom}</p>
                      {p.est_original && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">
                          <StarIcon className="w-3 h-3 fill-amber-400 text-amber-400" /> 1er publieur
                        </span>
                      )}
                    </div>
                    {/* Source mise en avant */}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${badge.cls}`}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label(p.group_nom)}
                      </span>
                      {p.contact_phone && (
                        canSeeOwnerPhone ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="w-3 h-3" /> {p.contact_phone}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400" title="Réservé aux administrateurs">
                            <Phone className="w-3 h-3" /> •••• (réservé admin)
                          </span>
                        )
                      )}
                      <span className="text-xs text-gray-400">{formatDate(p.publie_le)}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-50">
          Ordre = chronologie de publication. Ces informations restent internes : jamais exposées au client.
        </p>
      </section>

      {/* Candidats doublons */}
      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Copy className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-900">Doublons potentiels</h2>
          <span className="text-xs text-gray-400">({candidates.length})</span>
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-6">Aucun doublon détecté pour cette annonce.</p>
        ) : (
          <div className="p-5 space-y-2">
            <p className="text-xs text-gray-500 mb-2">
              Fusionner absorbe l&apos;annonce candidate dans celle-ci (qui devient canonical) et ajoute son publieur.
            </p>
            {candidates.map(c => (
              <MergeCandidate key={c.candidate_id} canonicalId={prop.id}
                candidate={{ id: c.candidate_id, titre: c.titre, prix: c.prix, statut: c.statut, score: c.score }} />
            ))}
          </div>
        )}
      </section>

      {/* Médias */}
      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Images className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Photos / Vidéos</h2>
          <span className="text-xs text-gray-400">({medias.length})</span>
        </div>
        <div className="p-5">
          <MediaSection propertyId={prop.id} initialMedia={medias} />
        </div>
      </section>

      {prop.description && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Description</h2>
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{prop.description}</p>
        </section>
      )}
    </div>
  )
}
