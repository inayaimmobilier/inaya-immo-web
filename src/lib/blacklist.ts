// ============================================================================
// Liste noire — bloque des utilisateurs par téléphone ou e-mail (même avant la
// création d'un compte). `checkBlacklist` est appelée aux points d'entrée :
// inscription, connexion, demande d'OTP mobile. Serveur uniquement.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Forme canonique d'un numéro pour le matching, tolérante local ⇄ +225 :
 * retire tout sauf les chiffres, l'indicatif 225 et les zéros de tête.
 *   « +225 07 07 84 04 31 » → « 707840431 »   « 0707840431 » → « 707840431 »
 */
export function canonicalPhone(v: string): string {
  let d = (v || "").replace(/\D/g, "")
  if (d.startsWith("225")) d = d.slice(3)
  d = d.replace(/^0+/, "")
  return d
}

/** Forme canonique d'un e-mail : minuscules, sans espaces. */
export function canonicalEmail(v: string): string {
  return (v || "").trim().toLowerCase()
}

export type BlacklistHit = { blocked: false } | { blocked: true; motif: string | null; type: "telephone" | "email" }

/**
 * Vérifie si un téléphone et/ou un e-mail figure dans la liste noire ACTIVE.
 * Best-effort : en cas d'erreur DB (table absente, etc.) on NE bloque pas
 * (fail-open) pour ne jamais verrouiller l'inscription par un incident.
 */
export async function checkBlacklist(input: { telephone?: string | null; email?: string | null }): Promise<BlacklistHit> {
  const phoneNorm = input.telephone ? canonicalPhone(input.telephone) : ""
  const emailNorm = input.email ? canonicalEmail(input.email) : ""
  if (!phoneNorm && !emailNorm) return { blocked: false }

  try {
    const admin = createAdminClient()
    // Une requête : toutes les entrées actives dont la forme canonique correspond.
    const norms = [phoneNorm, emailNorm].filter(Boolean)
    const { data } = await admin.from("blacklist")
      .select("type, valeur_norm, motif")
      .eq("actif", true)
      .in("valeur_norm", norms)

    const rows = (data ?? []) as { type: "telephone" | "email"; valeur_norm: string; motif: string | null }[]
    // On confirme le type pour éviter toute collision improbable tel/email.
    const hit = rows.find(r =>
      (r.type === "telephone" && phoneNorm && r.valeur_norm === phoneNorm) ||
      (r.type === "email" && emailNorm && r.valeur_norm === emailNorm),
    )
    if (hit) return { blocked: true, motif: hit.motif, type: hit.type }
    return { blocked: false }
  } catch (e) {
    console.error("INAYA-BLACKLIST-CHECK", (e as Error).message)
    return { blocked: false }
  }
}

/** Message générique renvoyé à l'utilisateur bloqué (ne révèle pas le motif interne). */
export const BLOCKED_MESSAGE = "Ce compte ne peut pas accéder au service. Contactez Inaya si vous pensez qu'il s'agit d'une erreur."
