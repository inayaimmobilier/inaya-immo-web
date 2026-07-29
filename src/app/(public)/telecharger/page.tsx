import Link from "next/link"
import { Smartphone, Download, ShieldCheck, Bell, Heart, Search } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Télécharger l'application Inaya Immo",
  description: "Installez l'application Inaya Immo sur votre téléphone Android : annonces vérifiées, alertes et assistant en direct.",
}
export const revalidate = 300

/** URL de l'APK, réglable par l'admin (Paramètres → clé app_apk_url). */
async function getApkUrl(): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("value").eq("key", "app_apk_url").maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    return typeof v === "string" && v.startsWith("http") ? v : null
  } catch { return null }
}

const ATOUTS = [
  { icon: Search, titre: "Toutes les annonces", texte: "Location, vente, cession et résidences meublées — filtrées par commune, quartier, type et budget." },
  { icon: Bell, titre: "Alertes instantanées", texte: "Enregistrez une recherche : vous êtes prévenu dès qu'un bien correspond." },
  { icon: Heart, titre: "Favoris & visites", texte: "Gardez vos biens préférés et demandez une visite en deux champs." },
  { icon: ShieldCheck, titre: "Annonces vérifiées", texte: "Chaque bien est contrôlé par nos agents. La mise en relation passe par Inaya." },
]

export default async function TelechargerPage() {
  const apkUrl = await getApkUrl()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-900 mb-4">
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">L&apos;application Inaya Immo</h1>
        <p className="text-gray-600 mt-2 max-w-xl mx-auto">
          Trouvez votre prochain logement depuis votre téléphone : annonces vérifiées à Bouaké et
          partout en Côte d&apos;Ivoire, alertes en temps réel et assistant disponible à toute heure.
        </p>

        <div className="mt-7">
          {apkUrl ? (
            <a href={apkUrl}
              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold px-7 py-4 rounded-xl transition-colors">
              <Download className="w-5 h-5" /> Télécharger pour Android
            </a>
          ) : (
            <div className="inline-block bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-5 py-4">
              L&apos;application arrive très bientôt. Revenez dans quelques jours !
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Fichier APK · Android 7 et plus · installation directe (hors Play Store pour l&apos;instant)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12">
        {ATOUTS.map(a => (
          <div key={a.titre} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <a.icon className="w-5 h-5 text-blue-700" />
            <h2 className="font-semibold text-gray-900 mt-3">{a.titre}</h2>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{a.texte}</p>
          </div>
        ))}
      </div>

      {apkUrl && (
        <div className="mt-10 bg-gray-50 border border-gray-100 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 text-sm">Comment installer ?</h2>
          <ol className="text-sm text-gray-600 mt-2 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Touchez <b>Télécharger pour Android</b> — le fichier arrive dans vos téléchargements.</li>
            <li>Ouvrez-le. Android peut demander d&apos;autoriser l&apos;installation depuis cette source : acceptez.</li>
            <li>Installez, puis ouvrez <b>Inaya Immo</b>. C&apos;est prêt.</li>
          </ol>
        </div>
      )}

      <p className="text-center text-sm text-gray-500 mt-10">
        Vous préférez le site ? <Link href="/biens" className="text-blue-700 font-medium hover:underline">Voir les annonces</Link>
      </p>
    </div>
  )
}
