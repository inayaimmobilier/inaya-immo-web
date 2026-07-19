import Link from "next/link"
import Navbar from "@/components/shared/Navbar"
import {
  Building2, Wallet, ShieldCheck, Wrench, FileText, Users, Clock, CheckCircle2, ArrowRight,
} from "lucide-react"

export const metadata = {
  title: "Gestion immobilière · Inaya Immo",
  description:
    "Confiez la gestion de vos biens à Inaya Immo : encaissement des loyers, suivi des locataires, " +
    "entretien et travaux, reporting transparent. Tranquillité d'esprit garantie à Bouaké et partout en Côte d'Ivoire.",
}

const AVANTAGES = [
  {
    icon: Wallet,
    titre: "Encaissement des loyers",
    desc: "Nous percevons les loyers chaque mois, suivons les retards et relançons automatiquement. Vous recevez vos versements ponctuellement.",
  },
  {
    icon: Users,
    titre: "Suivi des locataires",
    desc: "Sélection rigoureuse des locataires, vérification des dossiers, gestion des baux et des quittances. Un interlocuteur unique pour vos locataires.",
  },
  {
    icon: Wrench,
    titre: "Entretien & travaux",
    desc: "Coordination des interventions (plomberie, électricité, réparations) avec un réseau de prestataires vérifiés. Diagnostics et devis transparents.",
  },
  {
    icon: FileText,
    titre: "Reporting transparent",
    desc: "Tableau de bord en temps réel : loyers perçus, charges, travaux en cours, documents. Aucune zone d'ombre sur la gestion de votre patrimoine.",
  },
  {
    icon: ShieldCheck,
    titre: "Sécurité juridique",
    desc: "Baux conformes au droit ivoirien, gestion des impayés, procédures en règle. Nous protégeons vos intérêts à chaque étape.",
  },
  {
    icon: Clock,
    titre: "Disponibilité 7j/7",
    desc: "Une équipe réactive et un assistant IA disponible à tout moment pour vos locataires comme pour vous, propriétaires.",
  },
]

const ETAPES = [
  { n: 1, titre: "Premier rendez-vous", desc: "Nous évaluons votre bien, fixons le loyer cible et définissons ensemble le niveau de service souhaité." },
  { n: 2, titre: "Signature du mandat", desc: "Mandat de gestion clair : commission (généralement 8 à 10 % du loyer), durée, responsabilités. Tout est transparent." },
  { n: 3, titre: "Mise en gestion", desc: "Nous prenons le relais : état des lieux, recherche de locataire si besoin, activation du suivi mensuel." },
  { n: 4, titre: "Suivi mensuel", desc: "Encaissement, versement, reporting. Vous gardez un œil sur tout depuis votre espace propriétaire." },
]

export default function GestionImmobilierePage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-3 py-1 mb-5">
              <Building2 className="w-4 h-4" />
              <span className="text-xs font-medium tracking-wide">Service Inaya</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
              Gestion immobilière clé en main
            </h1>
            <p className="text-base sm:text-lg text-blue-100 mt-4 max-w-2xl leading-relaxed">
              Confiez la gestion de vos biens à <strong>Inaya Immo</strong> et profitez d&apos;un revenu
              passif sans contrainte. Nous nous occupons de tout : loyers, locataires, entretien,
              paperwork. Vous, vous percevez votre loyer chaque mois.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link
                href="/inscription?type=proprietaire"
                className="inline-flex items-center gap-2 bg-white text-blue-800 font-semibold px-5 py-3 rounded-xl hover:bg-blue-50 transition-colors"
              >
                Confier mon bien <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/connexion"
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 text-white font-medium px-5 py-3 rounded-xl hover:bg-white/20 transition-colors"
              >
                Espace propriétaire
              </Link>
            </div>
          </div>
        </section>

        {/* ── Avantages ────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Ce que nous gérons pour vous
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl mx-auto">
              Une gestion complète, transparente et professionnelle. Vous déléguez tout,
              vous gardez le contrôle.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {AVANTAGES.map(({ icon: Icon, titre, desc }) => (
              <div key={titre} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-700" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-2">{titre}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Étapes ───────────────────────────────────────────────────────── */}
        <section className="bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-12">
              Comment ça marche
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {ETAPES.map(({ n, titre, desc }) => (
                <div key={n} className="relative">
                  <div className="w-10 h-10 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center mb-4">
                    {n}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-2">{titre}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tarification ─────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="bg-gradient-to-br from-blue-50 to-amber-50 rounded-3xl p-8 sm:p-12 border border-blue-100">
            <div className="grid sm:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">Tarification simple</h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                  Une commission claire, prélevée sur le loyer encaissé. Aucun coût caché,
                  aucun frais fixe. Vous ne payez que si nous percevons votre loyer.
                </p>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    8 à 10 % du loyer mensuel
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    Aucun frais d&apos;inscription
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    Versement mensuel garanti
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    Résiliable à tout moment
                  </li>
                </ul>
              </div>
              <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">À partir de</p>
                <p className="text-4xl font-bold text-slate-900 mt-2">8 %</p>
                <p className="text-sm text-slate-500 mt-1">du loyer encaissé</p>
                <Link
                  href="/inscription?type=proprietaire"
                  className="mt-6 inline-flex items-center gap-2 bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl hover:bg-blue-800 transition-colors w-full justify-center"
                >
                  Démarrer <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA final ────────────────────────────────────────────────────── */}
        <section className="bg-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              Prêt à déléguer la gestion de vos biens ?
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mx-auto mb-6">
              Rejoignez les propriétaires qui font confiance à Inaya Immo pour un revenu
              passif serein à Bouaké et partout en Côte d&apos;Ivoire.
            </p>
            <Link
              href="/inscription?type=proprietaire"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Confier mon bien à Inaya <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
