import Link from "next/link"
import Navbar from "@/components/shared/Navbar"

export const metadata = {
  title: "Conditions d'utilisation · Inaya Immo",
  description: "Conditions générales d'utilisation de la plateforme Inaya Immo.",
}

function Section({ n, titre, children }: { n: number; titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-slate-900">{n}. {titre}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function ConditionsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Conditions générales d&apos;utilisation</h1>
            <p className="text-sm text-slate-500 mt-1">Plateforme <strong>Inaya Immo</strong> — Côte d&apos;Ivoire. Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}.</p>
          </div>

          <Section n={1} titre="Objet">
            <p>
              Inaya Immo (« la Plateforme ») met en relation des personnes recherchant un bien immobilier
              (location, vente, cession, gestion) avec des annonces vérifiées par nos agents. L&apos;utilisation
              de la Plateforme implique l&apos;acceptation pleine et entière des présentes conditions.
            </p>
          </Section>

          <Section n={2} titre="Annonces et vérification">
            <p>
              Les annonces publiées proviennent de nos agents, de propriétaires ou de partenaires, et sont
              contrôlées avant publication. Inaya Immo s&apos;efforce d&apos;assurer l&apos;exactitude des
              informations mais ne peut garantir la disponibilité permanente d&apos;un bien. La mise en
              relation avec le propriétaire est assurée par Inaya afin de protéger les deux parties.
            </p>
          </Section>

          <Section n={3} titre="Alertes et messages WhatsApp / SMS">
            <p>
              La Plateforme peut envoyer des alertes (WhatsApp, SMS, e-mail) présentant des biens correspondant
              à une recherche. <strong>Ces messages sont exclusivement réservés aux personnes ayant explicitement
              enregistré une recherche sur la Plateforme</strong> et fourni leur numéro à cette fin, ou ayant
              formulé une demande d&apos;accompagnement acceptée.
            </p>
            <p>
              En enregistrant une recherche avec votre numéro, vous <strong>consentez</strong> à recevoir ces
              alertes. Vous pouvez y mettre fin à tout moment en répondant « STOP » ou en supprimant votre
              recherche. Aucun message non sollicité n&apos;est envoyé aux personnes n&apos;ayant pas consenti.
            </p>
          </Section>

          <Section n={4} titre="Compte utilisateur">
            <p>
              La création d&apos;un compte peut nécessiter une vérification (code envoyé par WhatsApp, SMS ou
              e-mail). Vous êtes responsable de la confidentialité de vos identifiants et de l&apos;exactitude
              des informations fournies. Inaya Immo peut suspendre un compte en cas d&apos;usage abusif.
            </p>
          </Section>

          <Section n={5} titre="Données personnelles">
            <p>
              Les informations collectées (nom, téléphone, e-mail, critères de recherche) servent uniquement à
              fournir le service : mise en relation, alertes, suivi par un agent. Elles ne sont pas revendues à
              des tiers. Vous pouvez demander la rectification ou la suppression de vos données en nous
              contactant.
            </p>
          </Section>

          <Section n={6} titre="Engagements de l'utilisateur">
            <p>Vous vous engagez à ne pas :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>publier de fausses annonces ou des informations trompeuses ;</li>
              <li>utiliser la Plateforme à des fins frauduleuses ou de démarchage non autorisé ;</li>
              <li>contourner la mise en relation d&apos;Inaya pour échapper à d&apos;éventuelles commissions.</li>
            </ul>
          </Section>

          <Section n={7} titre="Responsabilité">
            <p>
              Inaya Immo agit en qualité d&apos;intermédiaire. La Plateforme ne saurait être tenue responsable
              des litiges entre parties, de l&apos;état réel d&apos;un bien ou des engagements pris en dehors de
              son intermédiation. Un agent Inaya accompagne toutefois les démarches jusqu&apos;à leur terme.
            </p>
          </Section>

          <Section n={8} titre="Contact">
            <p>
              Pour toute question relative à ces conditions ou à vos données, contactez-nous via la page
              d&apos;accueil ou le support indiqué sur la Plateforme.
            </p>
          </Section>

          <p className="text-xs text-slate-400 pt-4">
            <Link href="/" className="text-blue-700 hover:text-blue-800">← Retour à l&apos;accueil</Link>
          </p>
        </div>
      </main>
    </>
  )
}
