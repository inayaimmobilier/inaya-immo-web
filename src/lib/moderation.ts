import "server-only"
import { createAdminClient } from "@/lib/supabase/server"

export interface ModerationResult {
  decision: "approve" | "reject"
  reason: string
  /**
   * Vrai seulement quand l'IA a RÉELLEMENT rendu un avis.
   *
   * Sans clé, en panne ou à court de crédit, l'ancien code renvoyait
   * « approve » et l'annonce partait en ligne sans le moindre contrôle. Une
   * approbation par défaut n'est pas une approbation : elle laisse l'annonce
   * en file d'attente, où un agent la verra.
   */
  jugee: boolean
}

const DEFAULT_PROMPT = `Tu es un modérateur immobilier pour la plateforme Inaya Immo à Bouaké, Côte d'Ivoire.
Tu reçois les données d'une annonce immobilière soumise par un particulier.
Décide si elle doit être APPROUVÉE ou REJETÉE.

APPROUVER si : offre immobilière réelle, prix raisonnable pour Bouaké, catégorie cohérente, pas de spam.
REJETER si : pas une offre immobilière, prix aberrant, informations essentielles manquantes (ni prix ni localisation), spam/fraude.

Réponds UNIQUEMENT en JSON : {"decision":"approve"|"reject","reason":"explication courte en français (1-2 phrases)"}`

async function getModerationPrompt(): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "ia_moderation_prompt")
      .single()
    if (data) return (data as { value: string }).value
  } catch { /* fallback */ }
  return DEFAULT_PROMPT
}

export async function moderateProperty(propertyId: string, propertyData: {
  titre?: string | null
  description?: string | null
  type_offre?: string | null
  categorie?: string | null
  prix?: number | null
  quartier?: string | null
  ville?: string | null
}): Promise<ModerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const admin = createAdminClient()

  const annonceTxt = [
    `Titre : ${propertyData.titre ?? "—"}`,
    `Type : ${propertyData.type_offre ?? "—"}`,
    `Catégorie : ${propertyData.categorie ?? "—"}`,
    `Prix : ${propertyData.prix ? `${propertyData.prix} FCFA` : "non renseigné"}`,
    `Localisation : ${[propertyData.quartier, propertyData.ville].filter(Boolean).join(", ") || "non renseignée"}`,
    `Description : ${propertyData.description?.slice(0, 600) ?? "—"}`,
  ].join("\n")

  let result: ModerationResult = {
    decision: "approve", reason: "IA indisponible — en attente de validation par un agent", jugee: false,
  }

  if (apiKey) {
    const prompt = await getModerationPrompt()
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          system: prompt,
          messages: [{ role: "user", content: annonceTxt }],
        }),
      })
      if (res.ok) {
        const json = (await res.json()) as { content?: { text?: string }[] }
        const text = json.content?.[0]?.text ?? ""
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0]) as Omit<ModerationResult, "jugee">
          if (parsed.decision === "approve" || parsed.decision === "reject") {
            result = { ...parsed, jugee: true }
          }
        }
      }
    } catch { /* fallback: approuve */ }
  }

  // Met à jour le statut de l'annonce.
  //
  // Un rejet est toujours un rejet : même par défaut, mieux vaut retenir une
  // annonce douteuse. Une approbation, en revanche, ne publie que si l'IA a
  // vraiment répondu ; sinon l'annonce reste en file, visible dans Modération.
  const newStatut = result.decision === "reject" ? "rejete"
    : result.jugee ? "publie"
    : "en_attente_validation"
  await admin.from("properties").update({
    statut: newStatut,
    ia_moderation_decision: result.decision,
    ia_moderation_reason: result.reason,
    ia_moderation_at: new Date().toISOString(),
  } as never).eq("id", propertyId)

  return result
}
