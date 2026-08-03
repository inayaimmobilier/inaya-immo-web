"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/server"
import { verifierJetonStop } from "@/lib/stop-token"
import { limiteAtteinte } from "@/lib/rate-limit"

type Res = { ok: true; already?: boolean } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Désactive l'alerte d'UNE recherche précise via son jeton.
 * Le jeton est soit le numéro court « R820 » (colonne `reference`, migration 041),
 * soit l'UUID de la requête — ce dernier fonctionne SANS migration et garantit
 * qu'on arrête bien LA recherche concernée (jamais une autre).
 *
 * Appelé UNIQUEMENT sur action explicite du client (bouton), jamais au simple
 * chargement de la page (les robots d'aperçu de lien ne doivent rien désactiver).
 */
export async function stopAlert(token: string): Promise<Res> {
  const brut = String(token ?? "").trim()
  if (!brut) return { ok: false, error: "Référence invalide." }

  // Jeton SIGNÉ : la signature prouve qu'on tient le lien reçu par SMS.
  const { cible: raw, signe } = verifierJetonStop(brut)

  // Jeton NON signé — les SMS déjà partis en contiennent, et un client doit
  // toujours pouvoir se désabonner. Mais c'est aussi la voie qu'emprunterait
  // une énumération de /a/stop/1, /2, /3… : on la limite donc par adresse.
  // Cinq arrêts par heure suffisent largement à une personne réelle, et
  // rendent inatteignables les centaines de recherches de la base.
  if (!signe) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue"
    if (limiteAtteinte(`stop:${ip}`, 5, 60 * 60_000)) {
      return { ok: false, error: "Trop de tentatives. Réessayez dans une heure." }
    }
  }

  const admin = createAdminClient()

  let req: { id: string; statut: string } | null = null

  if (UUID_RE.test(raw)) {
    // Jeton = UUID de la requête (voie robuste, sans migration).
    const { data } = await admin.from("search_requests").select("id, statut").eq("id", raw).maybeSingle()
    req = (data as { id: string; statut: string } | null) ?? null
  } else {
    // Jeton = numéro court « R820 » → colonne `reference`. Si la colonne n'existe
    // pas encore (42703), la requête renvoie data null : jeton non résolu.
    const num = Number(raw.replace(/\D/g, ""))
    if (Number.isFinite(num) && num > 0) {
      const { data } = await admin.from("search_requests").select("id, statut").eq("reference", num).maybeSingle()
      req = (data as { id: string; statut: string } | null) ?? null
    }
  }

  if (!req) return { ok: false, error: "Aucune alerte à ce numéro." }
  if (req.statut !== "active") return { ok: true, already: true }
  const { error } = await admin.from("search_requests").update({ statut: "expiree" } as never).eq("id", req.id)
  if (error) { console.error("INAYA-ALERT-STOP-WEB", error); return { ok: false, error: "Échec de la désactivation." } }
  return { ok: true }
}
