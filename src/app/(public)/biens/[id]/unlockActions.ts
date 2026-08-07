"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { deverrouillerContact } from "@/lib/credits"

// ============================================================================
// ACHAT D'UN CONTACT DEPUIS LA FICHE D'UNE ANNONCE.
//
// L'identité vient de la session côté serveur, jamais d'un paramètre : accepter
// un identifiant transmis par le navigateur laisserait dépenser le solde d'un
// autre. Le tarif est calculé dans `deverrouillerContact`, jamais reçu d'ici.
// ============================================================================

type Achat =
  | { ok: true; telephone: string; nom: string | null; source: string; cout: number; solde: number }
  | { ok: false; error: string }

export async function deverrouiller(propertyId: string): Promise<Achat> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Connectez-vous à votre compte professionnel." }
  if (!propertyId) return { ok: false, error: "Annonce introuvable." }

  const r = await deverrouillerContact(user.id, propertyId)
  if (!r.ok) return r

  revalidatePath(`/biens/${propertyId}`)
  return { ok: true, telephone: r.telephone, nom: r.nom, source: r.source, cout: r.cout, solde: r.solde }
}

/**
 * Ouvre une réclamation sur un contact acheté.
 *
 * Le professionnel n'est PAS remboursé ici : un administrateur tranche. Il a
 * déjà le numéro au moment où il réclame, un remboursement automatique
 * reviendrait à distribuer les contacts gratuitement.
 */
export async function reclamer(propertyId: string, motif: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Connectez-vous." }

  const texte = motif.trim()
  if (texte.length < 5) return { ok: false, error: "Décrivez le problème en quelques mots." }

  const admin = createAdminClient()
  const { data } = await admin.from("contact_unlocks")
    .select("id").eq("user_id", user.id).eq("property_id", propertyId).maybeSingle()
  const unlock = data as unknown as { id: string } | null
  if (!unlock) return { ok: false, error: "Aucun achat trouvé pour cette annonce." }

  const { error } = await admin.from("contact_reclamations").insert({
    unlock_id: unlock.id,
    user_id: user.id,
    motif: texte.slice(0, 500),
  } as never)

  // Doublon : une seule réclamation par achat. Ce n'est pas une panne, c'est la
  // règle — on le dit sans alarmer.
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Une réclamation est déjà en cours sur ce contact." }
    console.error("INAYA-CREDIT-020", error)
    return { ok: false, error: "Envoi impossible pour le moment." }
  }
  return { ok: true }
}
