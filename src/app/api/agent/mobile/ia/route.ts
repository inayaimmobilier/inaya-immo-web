import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, estAdministration, refus } from "@/lib/agent-mobile"
import {
  MODEL_CATALOG, MODELES_VOYANTS, etatFournisseurs, getActiveModelId, verifierCle,
} from "@/lib/llm"
import { setSecret } from "@/lib/secrets"

// ============================================================================
// RÉGLER L'INTELLIGENCE ARTIFICIELLE DEPUIS LE TÉLÉPHONE.
//
// Jusqu'ici, ces réglages n'existaient que dans le back-office web. Or c'est
// sur le terrain qu'on constate que la lecture d'une fiche papier ne marche
// pas — et qu'on a besoin de comprendre pourquoi tout de suite.
//
// ── RÉSERVÉ À L'ADMINISTRATION ─────────────────────────────────────────────
//
// Une clé d'API engage le crédit de l'agence. Un agent n'a pas à la changer,
// ni même à la voir.
//
// ── LA CLÉ N'EST JAMAIS RENVOYÉE ───────────────────────────────────────────
//
// On dit seulement si un fournisseur EN A une. Une clé affichée à l'écran est
// une clé qui finit dans une capture d'écran, puis dans une conversation.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")
  if (!estAdministration(agent.role)) return refus("acces_refuse")

  const [actif, fournisseurs] = await Promise.all([getActiveModelId(), etatFournisseurs()])
  const parId = new Map(fournisseurs.map(f => [f.id, f]))

  const modeles = MODEL_CATALOG.map(m => ({
    id: m.id,
    label: m.label,
    fournisseur: m.provider,
    fournisseurLabel: parId.get(m.provider)?.label ?? m.provider,
    // Trois choses décident si un modèle est utilisable, et l'écran doit les
    // montrer séparément : est-il actif, sa clé existe-t-elle, sait-il lire
    // une image ?
    actif: m.id === actif,
    disponible: parId.get(m.provider)?.configure ?? false,
    voit: (MODELES_VOYANTS as readonly string[]).includes(m.id),
    ouvert: m.openSource,
  }))

  const lectureImages = modeles.find(m => m.voit && m.disponible) ?? null

  return NextResponse.json({
    modele_actif: actif,
    modeles,
    fournisseurs,
    // Le diagnostic que l'agent voudra lire en premier quand la lecture d'une
    // fiche échoue.
    lecture_images: {
      possible: Boolean(lectureImages),
      modele: lectureImages?.label ?? null,
      explication: lectureImages
        ? `Les photos seront lues par ${lectureImages.label}.`
        : "Aucun modèle capable de lire une image n'a de clé. Ajoutez une clé Anthropic, OpenAI ou Google.",
    },
  })
}

export async function PATCH(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")
  if (!estAdministration(agent.role)) return refus("acces_refuse")

  let c: { modele_id?: string; fournisseur?: string; cle?: string }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  // ── Changer le modèle actif ─────────────────────────────────────────────
  if (c.modele_id) {
    const entree = MODEL_CATALOG.find(m => m.id === c.modele_id)
    if (!entree) return NextResponse.json({ error: "modele_inconnu" }, { status: 400 })

    const fournisseurs = await etatFournisseurs()
    if (!fournisseurs.find(f => f.id === entree.provider)?.configure) {
      // Choisir un modèle dont la clé manque le rendrait actif et inerte :
      // l'assistant répondrait « souci technique » sans que personne ne sache
      // pourquoi.
      return NextResponse.json({
        error: "cle_manquante",
        message: `Enregistrez d'abord la clé de ${entree.label.split("(")[1]?.replace(")", "") ?? entree.provider}.`,
      }, { status: 400 })
    }

    await createAdminClient().from("app_settings").upsert(
      { key: "assistant_model", value: c.modele_id, updated_by: agent.userId } as never,
      { onConflict: "key" },
    )
  }

  // ── Enregistrer une clé ─────────────────────────────────────────────────
  if (c.fournisseur && typeof c.cle === "string") {
    const fournisseurs = await etatFournisseurs()
    const f = fournisseurs.find(x => x.id === c.fournisseur)
    if (!f) return NextResponse.json({ error: "fournisseur_inconnu" }, { status: 400 })

    const cle = c.cle.trim()
    if (cle.length < 10) return NextResponse.json({ error: "cle_trop_courte" }, { status: 400 })
    await setSecret(f.envKey, cle, agent.userId)
  }

  return NextResponse.json({ ok: true })
}

/** Vérifie une clé sans consommer de crédit : on demande la liste des modèles. */
export async function POST(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")
  if (!estAdministration(agent.role)) return refus("acces_refuse")

  let c: { fournisseur?: string }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (!c.fournisseur) return NextResponse.json({ error: "fournisseur_manquant" }, { status: 400 })

  const r = await verifierCle(c.fournisseur)
  return r.ok
    ? NextResponse.json({ ok: true, modeles: r.modeles.length, exemples: r.modeles.slice(0, 8) })
    : NextResponse.json({ ok: false, message: r.erreur })
}
