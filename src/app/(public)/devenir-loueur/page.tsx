import { Car, ShieldCheck, Wallet, Users } from "lucide-react"
import Formulaire from "./Formulaire"

export const metadata = {
  title: "Mettre son véhicule en location · Inaya Immo",
  description:
    "Confiez votre véhicule à Inaya Immo : nous trouvons les locataires, vous gardez la main sur vos tarifs et vos conditions.",
}

const ARGUMENTS = [
  {
    Icon: Users,
    titre: "Des clients déjà là",
    texte: "Nos annonces sont consultées chaque jour à Bouaké et Yamoussoukro. Vous n'avez pas à chercher les locataires.",
  },
  {
    Icon: Wallet,
    titre: "Vous fixez vos prix",
    texte: "Tarif à la journée, à la semaine, au mois, dépôt de garantie, kilométrage inclus : vous décidez, véhicule par véhicule.",
  },
  {
    Icon: ShieldCheck,
    titre: "Un état des lieux à chaque sortie",
    texte: "Photos et constat signés au départ comme au retour. En cas de litige, les preuves existent.",
  },
]

export default function DevenirLoueurPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <header className="text-center space-y-3">
        <span className="inline-flex items-center gap-2 text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
          <Car className="w-3.5 h-3.5" /> Location de véhicules
        </span>
        <h1 className="text-3xl font-bold text-gray-900">
          Votre véhicule vous rapporte, même quand vous ne roulez pas
        </h1>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Agence, société de taxi ou simple particulier : confiez-nous un ou plusieurs
          véhicules. Nous nous occupons des clients, vous gardez la main sur vos tarifs
          et vos conditions.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ARGUMENTS.map(({ Icon, titre, texte }) => (
          <div key={titre} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
              <Icon className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">{titre}</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{texte}</p>
          </div>
        ))}
      </div>

      <Formulaire />
    </div>
  )
}
