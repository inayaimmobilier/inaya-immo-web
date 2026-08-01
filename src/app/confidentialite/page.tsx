import Navbar from "@/components/shared/Navbar"
import Link from "next/link"
import { SITE_NAME, absoluteUrl } from "@/lib/site"

// ============================================================================
// Politique de confidentialité — page PUBLIQUE et stable.
// Exigée par Google Play pour toute application qui recueille des données
// personnelles (ici : nom, téléphone, e-mail facultatif). Son URL est déclarée
// dans la fiche Play Console ; elle doit rester accessible sans connexion.
// Le contenu décrit ce que la plateforme fait RÉELLEMENT — toute divergence
// avec le formulaire « Sécurité des données » entraîne un rejet.
// ============================================================================
export const metadata = {
  title: `Politique de confidentialité · ${SITE_NAME}`,
  description: `Quelles données ${SITE_NAME} recueille, pourquoi, combien de temps, et comment les supprimer.`,
  alternates: { canonical: "/confidentialite" },
}

const MAJ = "1er août 2026"

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-900">{titre}</h2>
      <div className="text-[15px] text-gray-700 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function ConfidentialitePage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Politique de confidentialité</h1>
            <p className="text-sm text-gray-500">Dernière mise à jour : {MAJ}</p>
            <p className="text-gray-600 leading-relaxed">
              {SITE_NAME} met en relation des personnes qui cherchent un logement à Bouaké et
              Yamoussoukro avec des propriétaires, par l&apos;intermédiaire de ses agents. Cette
              page explique en langage clair les données que nous recueillons, ce que nous en
              faisons, et comment vous pouvez les supprimer.
            </p>
          </header>

          <Section titre="Qui est responsable">
            <p>
              {SITE_NAME}, plateforme immobilière opérant à Bouaké (Côte d&apos;Ivoire).
              Pour toute question relative à vos données, écrivez-nous depuis la page{" "}
              <Link href="/supprimer-mon-compte" className="text-blue-700 underline underline-offset-2">
                suppression de compte
              </Link>{" "}
              ou par WhatsApp au numéro affiché sur le site.
            </p>
          </Section>

          <Section titre="Ce que nous recueillons">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Votre nom et votre numéro de téléphone</strong>, lorsque vous créez un
                compte ou que vous contactez un agent à propos d&apos;une annonce. Le numéro est
                indispensable : c&apos;est par lui que l&apos;agent vous rappelle.
              </li>
              <li>
                <strong>Votre adresse e-mail</strong>, seulement si vous choisissez d&apos;en
                fournir une. Elle est facultative.
              </li>
              <li>
                <strong>Votre commune</strong>, si vous la renseignez, pour vous proposer des biens
                proches.
              </li>
              <li>
                <strong>Vos recherches et vos alertes</strong>, afin de vous prévenir quand un bien
                correspond à ce que vous cherchez.
              </li>
              <li>
                <strong>Un identifiant technique de notification</strong> (jeton push), si vous
                acceptez de recevoir des alertes sur votre téléphone.
              </li>
              <li>
                <strong>Des statistiques de fréquentation anonymes</strong> : pages consultées,
                associées à un identifiant aléatoire qui ne contient aucune donnée personnelle.
              </li>
              <li>
                <strong>Les annonces que vous publiez</strong> et les photos que vous y joignez.
              </li>
            </ul>
            <p>
              Nous ne recueillons ni votre position GPS, ni vos contacts, ni vos messages, ni aucune
              donnée bancaire. L&apos;application ne réalise aucun paiement.
            </p>
          </Section>

          <Section titre="Pourquoi nous les utilisons">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Vous mettre en relation avec un agent au sujet d&apos;une annonce.</li>
              <li>Vous prévenir quand un bien correspond à votre recherche.</li>
              <li>Publier et modérer les annonces déposées sur la plateforme.</li>
              <li>Comprendre quelles pages sont consultées, pour améliorer le service.</li>
            </ul>
            <p>
              Nous ne vendons pas vos données et nous ne les louons à personne.
            </p>
          </Section>

          <Section titre="Qui peut y accéder">
            <p>
              Seuls les agents et administrateurs {SITE_NAME} accèdent à vos coordonnées, et
              uniquement pour traiter votre demande. Les coordonnées des propriétaires ne sont
              jamais communiquées aux visiteurs, et les vôtres ne sont jamais communiquées aux
              propriétaires : la mise en relation passe toujours par nos agents.
            </p>
            <p>
              Nous nous appuyons sur des prestataires techniques qui hébergent ou acheminent ces
              données pour notre compte : Supabase (base de données), Vercel (hébergement du site),
              Expo (notifications), WhatsApp Business et un opérateur SMS (envoi des messages).
            </p>
          </Section>

          <Section titre="Combien de temps nous les gardons">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Votre compte et vos coordonnées : tant que le compte existe.</li>
              <li>Vos demandes de visite : trois ans, pour le suivi des dossiers.</li>
              <li>Vos alertes de recherche : jusqu&apos;à ce que vous les arrêtiez.</li>
              <li>Statistiques de fréquentation anonymes : douze mois.</li>
            </ul>
          </Section>

          <Section titre="Vos droits">
            <p>
              Vous pouvez à tout moment consulter, corriger ou supprimer vos données. La
              suppression du compte s&apos;effectue directement depuis l&apos;application
              (onglet <strong>Compte</strong>) ou depuis la page{" "}
              <Link href="/supprimer-mon-compte" className="text-blue-700 underline underline-offset-2">
                {absoluteUrl("/supprimer-mon-compte")}
              </Link>.
            </p>
            <p>
              La suppression efface votre profil, vos alertes, vos favoris et vos jetons de
              notification. Les annonces déjà publiées et les demandes traitées sont conservées de
              façon anonyme, sans votre nom ni votre numéro, pour la cohérence du catalogue et de
              notre comptabilité.
            </p>
          </Section>

          <Section titre="Enfants">
            <p>
              Le service s&apos;adresse à des adultes. Nous ne recueillons pas sciemment de données
              concernant des personnes de moins de 18 ans.
            </p>
          </Section>

          <Section titre="Modifications">
            <p>
              Toute évolution de cette politique sera publiée sur cette page, avec une nouvelle date
              de mise à jour.
            </p>
          </Section>
        </div>
      </main>
    </>
  )
}
