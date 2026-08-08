"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { Download, X, Smartphone } from "lucide-react"

/**
 * BANNIÈRE DE TÉLÉCHARGEMENT DE L'APPLICATION.
 *
 * L'application n'est pas encore sur le Play Store : le site est donc le seul
 * canal de distribution. Une page « /telecharger » existait, mais il fallait la
 * chercher — personne ne va sur une page qu'on ne lui montre pas.
 *
 * Barre BASSE et non modale : elle reste visible sur toutes les pages sans
 * masquer le contenu ni s'interposer devant une annonce. Un panneau modal
 * convertirait peut-être davantage, au prix d'un visiteur sur deux qui repart —
 * et Google sanctionne les interstitiels intrusifs sur mobile, ce qui coûterait
 * bien plus que ce que la bannière rapporte.
 *
 * Elle se referme, et le refus est retenu : redemander à chaque page ferait
 * fuir précisément les gens qu'on veut garder.
 */
const CLE_REFUS = "inaya_banniere_app_fermee"

/** Espaces où la bannière n'a rien à faire : on y travaille, on n'y prospecte pas. */
const CHEMINS_EXCLUS = [
  "/admin", "/client", "/proprietaire", "/locataire", "/prestataire", "/apporteur",
  "/connexion", "/inscription", "/telecharger", "/a/stop", "/supprimer-mon-compte",
]

export default function AppDownloadBanner({ apkUrl, pro = false }: { apkUrl: string; pro?: boolean }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [iOS, setIOS] = useState(false)
  const [vid, setVid] = useState("")

  useEffect(() => {
    // Lecture APRÈS le montage : `localStorage` n'existe pas au rendu serveur,
    // et afficher puis masquer produirait un clignotement à chaque page.
    try {
      if (localStorage.getItem(CLE_REFUS) === "1") return
    } catch { /* navigation privée : on affiche, c'est le moindre mal */ }

    // Un APK ne s'installe pas sur iPhone. On l'affiche quand même — le
    // visiteur doit savoir que l'application existe — mais on l'envoie vers la
    // page d'explication au lieu de lui servir un fichier inutilisable.
    setIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
    // Identifiant de visite, pour distinguer téléchargements et personnes.
    try { setVid(localStorage.getItem("inaya_vid") ?? "") } catch { /* sans effet */ }
    setVisible(true)
  }, [])

  const fermer = () => {
    setVisible(false)
    try { localStorage.setItem(CLE_REFUS, "1") } catch { /* sans effet */ }
  }

  // Sans APK configuré, pas de bannière : mieux vaut rien qu'un bouton qui ne
  // télécharge rien. L'adresse se règle dans Admin → Paramètres.
  if (!apkUrl?.trim()) return null
  if (CHEMINS_EXCLUS.some(p => pathname?.startsWith(p))) return null
  if (!visible) return null

  return (
    <div
      role="complementary"
      aria-label="Télécharger l'application Inaya Immo"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-800/40 bg-blue-700 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.18)]"
      // La barre de discussion flotte en bas à droite : sans cette marge sur
      // mobile, les deux se chevauchent et l'une rend l'autre inutilisable.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:flex">
          <Smartphone className="h-6 w-6" aria-hidden />
        </span>

        <div className="min-w-0 flex-1 pr-10 sm:pr-0">
          <p className="text-sm font-semibold leading-tight sm:text-base">
            {/* Un professionnel télécharge la MÊME application : elle porte son
                espace pro dès qu'il s'y connecte. Lui promettre une seconde
                application, qui n'existe pas, ne ferait que le dérouter. */}
            {pro
              ? "Votre espace professionnel sur votre téléphone"
              : "Installez Inaya Immo sur votre téléphone"}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-blue-100 sm:text-xs">
            {iOS
              ? "Bientôt sur iPhone — voir comment être prévenu"
              : pro
                ? "Solde, contacts débloqués et catalogue complet, partout"
                : "Alertes immédiates dès qu'un bien correspond à votre recherche"}
          </p>
        </div>

        {iOS ? (
          <Link
            href="/telecharger"
            className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            En savoir plus
          </Link>
        ) : (
          <a
            // On passe par /telecharger/apk : le lien direct partait sans
            // laisser de trace, impossible de savoir si la bannière servait.
            href={`/telecharger/apk${vid ? `?vid=${encodeURIComponent(vid)}` : ""}`}
            // `download` ne suffit pas sur un fichier servi par un autre
            // domaine : c'est l'en-tête du serveur qui décide. On garde
            // l'attribut pour le cas favorable, sans compter dessus.
            download
            rel="nofollow"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Télécharger
          </a>
        )}

        <button
          type="button"
          onClick={fermer}
          aria-label="Fermer la bannière"
          className="absolute right-2 top-2 rounded-lg p-1.5 text-blue-100 transition hover:bg-white/10 hover:text-white sm:static sm:ml-1"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
