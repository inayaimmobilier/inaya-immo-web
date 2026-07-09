import Navbar from "@/components/shared/Navbar"
import PublierForm from "./PublierForm"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { PlusCircle, Shield, Clock, Phone } from "lucide-react"

export const metadata = { title: "Publier une annonce – Inaya Immo" }

async function getVilles() {
  const admin = createAdminClient()
  const { data } = await admin.from("villes").select("id,nom").eq("actif", true).order("ordre").order("nom")
  return (data ?? []) as { id: string; nom: string }[]
}

/** Coordonnées du compte connecté — évite de redemander nom/téléphone. */
async function getInitialContact() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: prof } = await supabase.from("profiles").select("nom, prenom, telephone").eq("id", user.id).maybeSingle()
  const p = prof as { nom: string | null; prenom: string | null; telephone: string | null } | null
  const nom = `${p?.prenom || ""} ${p?.nom || ""}`.trim() || null
  return { nom, telephone: p?.telephone || null }
}

export default async function PublierPage() {
  const [villes, initialContact] = await Promise.all([getVilles(), getInitialContact()])
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">Publier une annonce</h1>
            </div>
            <p className="text-blue-100 text-sm leading-relaxed max-w-lg">
              Vous avez un bien à louer ou à vendre à Bouaké ?
              Soumettez-le en quelques minutes. Notre équipe le vérifie et le publie rapidement.
            </p>

            {/* Avantages */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              {[
                { icon: Shield, text: "Vos coordonnées restent confidentielles" },
                { icon: Clock, text: "Mise en ligne en quelques heures" },
                { icon: Phone, text: "Nos agents gèrent les clients pour vous" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex flex-col items-center text-center gap-2 bg-white/10 rounded-xl p-3">
                  <Icon className="w-4 h-4 text-amber-300" />
                  <p className="text-xs text-blue-100 leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
            <PublierForm villes={villes} initialContact={initialContact} />
          </div>

          {/* Commission info */}
          <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <p className="text-sm font-semibold text-blue-900 mb-1">Comment fonctionne la commission ?</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              La publication de l&apos;annonce est <strong>entièrement gratuite</strong>.
              Inaya Immo perçoit une commission uniquement si une transaction est conclue grâce à notre mise en relation.
              Nos agents vous expliqueront les détails lors de la validation de votre annonce.
            </p>
          </div>
        </div>

      </main>

      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs">
        © {new Date().getFullYear()} Inaya Immo · Bouaké, Côte d&apos;Ivoire
      </footer>
    </>
  )
}
