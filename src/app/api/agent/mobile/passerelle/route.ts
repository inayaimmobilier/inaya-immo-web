import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"

// ============================================================================
// SANTÉ DE LA PASSERELLE SMS.
//
// POURQUOI CETTE ROUTE EXISTE.
//
// Du 7 août au 21 septembre 2026, aucun SMS d'Inaya n'a été délivré. Six
// semaines. La cause était banale — la ligne MTN du téléphone passerelle était
// à 0 FCFA — mais RIEN, nulle part, ne le disait. L'application répondait
// « ok: true, envoyés: 12 » dès que les messages entraient dans la file, et
// s'arrêtait là. « Mis en file » et « délivré » étaient le même mot.
//
// Pendant ce temps la file accumulait 93 messages en attente et 454 échecs,
// visibles uniquement en interrogeant la base à la main.
//
// Cette route répond à la seule question qui compte : « est-ce que ça part ? ».
// Elle est volontairement lisible par n'importe quel agent, pas réservée à
// l'administration : c'est l'agent qui constate qu'un client ne répond pas.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Au-delà, un silence n'est plus un creux d'activité mais une panne. */
const SILENCE_ALERTE_H = 6

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const admin = createAdminClient()
  const depuis24h = new Date(Date.now() - 24 * 3600_000).toISOString()

  const [interrupteur, dernier, attente, echecs] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "sms_gateway_active").maybeSingle(),
    admin.from("sms_queue").select("envoye_le").eq("statut", "envoye")
      .order("envoye_le", { ascending: false }).limit(1).maybeSingle(),
    admin.from("sms_queue").select("id", { count: "exact", head: true })
      .in("statut", ["en_attente", "envoi_en_cours"]),
    admin.from("sms_queue").select("erreur")
      .eq("statut", "echec").gte("created_at", depuis24h).limit(500),
  ])

  const v = (interrupteur.data as { value: unknown } | null)?.value
  const active = v === true || v === "true" || v === "1"

  const envoyeLe = (dernier.data as { envoye_le: string | null } | null)?.envoye_le ?? null
  const heures = envoyeLe
    ? Math.floor((Date.now() - new Date(envoyeLe).getTime()) / 3600_000)
    : null

  // Le motif DOMINANT, pas la liste. Quatre cent cinquante lignes identiques
  // n'apprennent rien de plus que la première ; ce qu'il faut savoir, c'est
  // laquelle revient et combien de fois.
  const lignes = (echecs.data ?? []) as { erreur: string | null }[]
  const comptes = new Map<string, number>()
  for (const l of lignes) {
    const motif = (l.erreur ?? "sans motif").split("[")[0].trim().slice(0, 140)
    comptes.set(motif, (comptes.get(motif) ?? 0) + 1)
  }
  const dominant = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  // Le verdict est rendu ICI, pas dans l'application : la règle doit être la
  // même pour tout le monde, et corrigeable sans republier les téléphones.
  const enPanne = !active || heures === null || heures >= SILENCE_ALERTE_H

  return NextResponse.json({
    active,
    en_panne: enPanne,
    dernier_envoi: envoyeLe,
    heures_depuis_dernier_envoi: heures,
    en_attente: attente.count ?? 0,
    echecs_24h: lignes.length,
    motif_dominant: dominant ? { motif: dominant[0], nombre: dominant[1] } : null,
    resume: resume({ active, heures, attente: attente.count ?? 0, dominant }),
  })
}

/**
 * Une phrase, écrite pour être lue sur un téléphone, au milieu d'un envoi.
 * Elle doit dire ce qui se passe ET ce qu'il faut faire.
 */
function resume(e: {
  active: boolean
  heures: number | null
  attente: number
  dominant: [string, number] | null
}): string {
  if (!e.active) return "La passerelle SMS est en pause. Aucun SMS ne partira."
  if (e.heures === null) return "Aucun SMS n'est jamais parti par la passerelle."

  if (e.heures >= SILENCE_ALERTE_H) {
    const duree = e.heures >= 48
      ? `${Math.floor(e.heures / 24)} jours`
      : `${e.heures} heures`
    const cause = e.dominant ? ` Motif le plus fréquent : ${e.dominant[0]}.` : ""
    const file = e.attente > 0 ? ` ${e.attente} message(s) attendent.` : ""
    return `Aucun SMS délivré depuis ${duree}.${file}${cause}`
  }

  return e.attente > 0
    ? `La passerelle fonctionne. ${e.attente} message(s) en cours d'envoi.`
    : "La passerelle fonctionne."
}
