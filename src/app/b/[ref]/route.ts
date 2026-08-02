import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// LIEN COURT vers une annonce : /b/5335 → /biens/{uuid}
//
// Un SMS se paie au segment, et l'identifiant technique en coûtait 43
// caractères à lui seul :
//   https://www.inaya.ci/biens/831e26c8-553c-4314-ae3b-1af3e986956f   (69 car.)
//   https://www.inaya.ci/b/5335                                       (27 car.)
//
// Le gain n'est pas que comptable. Un lien court se lit, se recopie et se dicte
// au téléphone ; surtout, il ne ressemble plus au lien de désabonnement placé
// juste en dessous — deux longues suites de caractères se confondaient à l'œil,
// au risque qu'on arrête ses alertes en croyant ouvrir l'annonce.
//
// `reference` est le numéro affiché sur la fiche (« annonce N° 5335 ») : le
// client peut donc citer ce même numéro à un agent.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  const { ref } = await ctx.params
  const numero = Number.parseInt(String(ref).trim(), 10)

  // Référence illisible : on renvoie vers le catalogue plutôt qu'une page
  // d'erreur. Le destinataire d'un SMS n'a rien à réparer.
  if (!Number.isFinite(numero) || numero <= 0) {
    return NextResponse.redirect(new URL("/biens", _req.url), 302)
  }

  const { data } = await createAdminClient()
    .from("properties").select("id").eq("reference", numero).maybeSingle()

  const id = (data as { id: string } | null)?.id
  return NextResponse.redirect(
    new URL(id ? `/biens/${id}` : "/biens", _req.url),
    // 302 et non 301 : une annonce retirée puis republiée peut changer
    // d'identifiant, et un 301 resterait gravé dans les navigateurs.
    302,
  )
}
