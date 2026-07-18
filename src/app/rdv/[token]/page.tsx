import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Home, Calendar, MapPin, CheckCircle2, XCircle, Clock } from "lucide-react"
import { confirmerVisite, refuserVisite } from "./actions"
import RedirectHome from "./RedirectHome"

export const metadata = { title: "Validation du rendez-vous · Inaya Immo" }

interface PageProps { params: Promise<{ token: string }> }

interface LeadRow {
  id: string
  contact_nom: string | null
  message: string | null
  creneaux: { souhaite?: string }[] | null
  validation_proprietaire: string
  properties: { titre: string; quartier: string | null; ville: string | null } | { titre: string; quartier: string | null; ville: string | null }[] | null
}

export default async function ValidationRdvPage({ params }: PageProps) {
  const { token } = await params
  // SÉCURITÉ : le token vient de l'URL (non fiable). On EXIGE un UUID strict avant
  // toute requête — sinon un token forgé (ex. « x,id.not.is.null ») injecterait un
  // filtre PostgREST dans le .or() et matcherait n'importe quel lead.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound()
  const admin = createAdminClient()
  const sel = "id, contact_nom, message, creneaux, validation_proprietaire, properties(titre, quartier, ville)"
  // Résout le lead par ID (nouveaux liens) OU par validation_token (liens déjà
  // envoyés). Repli sur l'ID seul si la colonne validation_token n'existe pas encore.
  let { data } = await admin.from("leads").select(sel)
    .or(`id.eq.${token},validation_token.eq.${token}`).maybeSingle()
  if (!data) {
    const byId = await admin.from("leads").select(sel).eq("id", token).maybeSingle()
    data = byId.data
  }

  const lead = data as LeadRow | null
  if (!lead) notFound() // lien invalide ou expiré

  const prop = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
  const creneau = lead.creneaux?.[0]?.souhaite ?? null
  const decided = lead.validation_proprietaire !== "en_attente"
  const confirmed = lead.validation_proprietaire === "confirme"

  const confirmer = confirmerVisite.bind(null, token)
  const refuser = refuserVisite.bind(null, token)

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-12 h-12 rounded-2xl mb-3" />
          <h1 className="text-xl font-bold">
            <span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Validation d&apos;un rendez-vous de visite</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {/* Récapitulatif */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MapPin className="w-4 h-4 text-blue-600" /> {prop?.titre ?? "Votre bien"}
            </p>
            {(prop?.quartier || prop?.ville) && (
              <p className="text-xs text-gray-500 pl-6">{[prop?.quartier, prop?.ville].filter(Boolean).join(" · ")}</p>
            )}
            {creneau && (
              <p className="flex items-center gap-2 text-sm text-gray-700">
                <Calendar className="w-4 h-4 text-gray-400" /> Créneau souhaité : <strong>{creneau}</strong>
              </p>
            )}
            {lead.message && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2">« {lead.message} »</p>
            )}
            <p className="text-xs text-gray-400 pt-1">
              Un client souhaite visiter ce bien. Le contact du client reste géré par Inaya.
            </p>
          </div>

          {decided ? (
            <div className="space-y-3">
              <div className={`rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium ${
                confirmed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {confirmed
                  ? <><CheckCircle2 className="w-5 h-5" /> Rendez-vous confirmé. Merci ! Inaya organise la visite.</>
                  : <><XCircle className="w-5 h-5" /> Rendez-vous refusé. Inaya proposera un autre créneau au client.</>}
              </div>
              <RedirectHome seconds={6} />
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <form action={confirmer}>
                <button type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> Confirmer le rendez-vous
                </button>
              </form>
              <form action={refuser}>
                <button type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <XCircle className="w-4 h-4 text-red-500" /> Refuser / proposer un autre créneau
                </button>
              </form>
              <p className="flex items-center gap-1.5 text-[11px] text-gray-400 justify-center pt-1">
                <Clock className="w-3 h-3" /> Le client est informé de votre décision automatiquement.
              </p>
              <Link href="/" className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 pt-1">
                <Home className="w-3.5 h-3.5" /> Retour à l&apos;accueil
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
