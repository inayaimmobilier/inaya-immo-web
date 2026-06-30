import Navbar from "@/components/shared/Navbar"
import PublierForm from "../../publier/PublierForm"
import { createAdminClient } from "@/lib/supabase/server"
import { Sofa, Shield, Clock, BadgeCheck } from "lucide-react"

export const metadata = { title: "Publier une résidence meublée – Inaya Immo" }

async function getVilles() {
  const admin = createAdminClient()
  const { data } = await admin.from("villes").select("id,nom").eq("actif", true).order("ordre").order("nom")
  return (data ?? []) as { id: string; nom: string }[]
}

export default async function PublierResidencePage() {
  const villes = await getVilles()
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Sofa className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">Publier une résidence meublée</h1>
            </div>
            <p className="text-teal-50 text-sm leading-relaxed max-w-lg">
              Vous avez un appartement ou un studio meublé à proposer ? Soumettez-le avec ses photos et vidéos.
              Notre équipe le vérifie, puis l&apos;active dans le catalogue des résidences meublées.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-8">
              {[
                { icon: Shield, text: "Vos coordonnées restent confidentielles" },
                { icon: BadgeCheck, text: "Validé puis publié par notre équipe" },
                { icon: Clock, text: "Mise en ligne rapide après vérification" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex flex-col items-center text-center gap-2 bg-white/10 rounded-xl p-3">
                  <Icon className="w-4 h-4 text-amber-300" />
                  <p className="text-xs text-teal-50 leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
            <PublierForm villes={villes} residence />
          </div>
        </div>
      </main>

      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs">
        © {new Date().getFullYear()} Inaya Immo · Bouaké, Côte d&apos;Ivoire
      </footer>
    </>
  )
}
