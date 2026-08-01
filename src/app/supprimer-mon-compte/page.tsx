import Navbar from "@/components/shared/Navbar"
import Link from "next/link"
import { Smartphone, MessageCircle, Trash2 } from "lucide-react"
import { SITE_NAME } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// Suppression de compte — page PUBLIQUE.
// Google Play exige une URL accessible SANS installer l'application, décrivant
// la marche à suivre et les données effacées. Elle est déclarée dans la fiche
// Play Console à côté de la politique de confidentialité.
// ============================================================================
export const revalidate = 3600

export const metadata = {
  title: `Supprimer mon compte · ${SITE_NAME}`,
  description: `Comment supprimer votre compte ${SITE_NAME} et quelles données sont effacées.`,
  alternates: { canonical: "/supprimer-mon-compte" },
}

async function supportPhone(): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "contact_support").maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    return typeof v === "string" && v.trim() ? v.trim() : null
  } catch { return null }
}

export default async function SupprimerComptePage() {
  const tel = await supportPhone()
  const wa = tel
    ? `https://wa.me/${tel.replace(/\D/g, "").replace(/^0/, "225")}?text=${encodeURIComponent(
        "Bonjour, je souhaite supprimer mon compte Inaya Immo. Mon numéro est : ")}`
    : null

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Supprimer mon compte</h1>
            <p className="text-gray-600 leading-relaxed">
              Vous pouvez supprimer votre compte {SITE_NAME} à tout moment, sans donner de raison.
              Deux façons de procéder.
            </p>
          </header>

          <section className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-2">
            <h2 className="font-semibold text-blue-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Depuis l&apos;application
            </h2>
            <p className="text-[15px] text-blue-900/90 leading-relaxed">
              Ouvrez l&apos;application, allez dans l&apos;onglet <strong>Compte</strong>, puis
              touchez <strong>Supprimer mon compte</strong> en bas de l&apos;écran. La suppression
              est immédiate et vous êtes déconnecté.
            </p>
          </section>

          {wa && (
            <section className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Sans l&apos;application
              </h2>
              <p className="text-[15px] text-gray-700 leading-relaxed">
                Écrivez-nous par WhatsApp depuis le numéro associé à votre compte. Nous procédons à
                la suppression sous 48 heures et vous confirmons par message.
              </p>
              <a href={wa} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
                <MessageCircle className="w-4 h-4" /> Demander la suppression
              </a>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-gray-400" /> Ce qui est effacé
            </h2>
            <ul className="list-disc pl-5 text-[15px] text-gray-700 space-y-1.5 leading-relaxed">
              <li>Votre profil : nom, numéro de téléphone, e-mail, commune.</li>
              <li>Vos alertes de recherche — vous ne recevez plus aucun message.</li>
              <li>Vos favoris et vos notifications.</li>
              <li>Les jetons de notification de vos appareils.</li>
            </ul>

            <h2 className="text-lg font-semibold text-gray-900 pt-2">Ce qui est conservé, sans votre identité</h2>
            <p className="text-[15px] text-gray-700 leading-relaxed">
              Les demandes de visite déjà traitées par un agent, ainsi que les annonces publiées,
              sont conservées pour la cohérence du catalogue et le suivi des dossiers. Votre nom et
              votre numéro en sont <strong>retirés</strong> : ces enregistrements ne permettent plus
              de vous identifier.
            </p>
          </section>

          <p className="text-sm text-gray-500">
            Voir aussi la{" "}
            <Link href="/confidentialite" className="text-blue-700 underline underline-offset-2">
              politique de confidentialité
            </Link>.
          </p>
        </div>
      </main>
    </>
  )
}
