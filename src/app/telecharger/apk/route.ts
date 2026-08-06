import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getApkUrl } from "@/lib/app-apk"

// ============================================================================
// TÉLÉCHARGEMENT DE L'APPLICATION — compté, puis redirigé.
//
// La bannière pointait directement sur le fichier hébergé : le téléchargement
// partait sans passer par nous, donc sans laisser la moindre trace. Impossible
// de savoir si la bannière servait à quelque chose.
//
// On passe donc par ici : on enregistre, puis on redirige vers le fichier.
// Compter au clic plutôt qu'à l'affichage mesure une intention réelle, et le
// comptage fonctionne SANS JavaScript — un mouchard côté navigateur raterait
// les visiteurs qui bloquent les scripts, et surtout tous ceux dont le réseau
// coupe avant l'exécution.
//
// Le chemin `/telechargement-app` est écrit dans `page_views` : la table a déjà
// ce qu'il faut (visiteur, chemin, provenance, date) et cela évite une
// migration pour trois colonnes identiques. Il est EXCLU du décompte des pages
// vues du tableau de bord, sans quoi chaque téléchargement gonflerait
// artificiellement la fréquentation.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Chemin conventionnel — partagé avec le tableau de bord, qui l'exclut et le compte. */
export const CHEMIN_TELECHARGEMENT = "/telechargement-app"

export async function GET(req: NextRequest) {
  const cible = await getApkUrl()

  // Sans APK configuré, on renvoie vers la page d'explication plutôt que vers
  // une erreur : le visiteur a cliqué « Télécharger », il mérite une réponse.
  if (!cible) return NextResponse.redirect(new URL("/telecharger", req.url), 302)

  try {
    await createAdminClient().from("page_views").insert({
      // `visitor_id` sert à distinguer téléchargements et personnes : dix clics
      // du même visiteur ne font pas dix installations. Il vit dans le
      // `localStorage` du navigateur — illisible côté serveur — donc la
      // bannière le joint au lien. Absent, on compte quand même : mieux vaut un
      // téléchargement anonyme qu'un téléchargement perdu.
      visitor_id: req.nextUrl.searchParams.get("vid")?.slice(0, 64) || null,
      path: CHEMIN_TELECHARGEMENT,
      referrer: req.headers.get("referer")?.slice(0, 300) ?? null,
    } as never)
  } catch {
    // Best-effort : un comptage indisponible ne doit jamais empêcher un
    // téléchargement. C'est le téléchargement qui compte, pas la statistique.
  }

  return NextResponse.redirect(cible, 302)
}
