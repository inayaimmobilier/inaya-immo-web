"use server"

import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// INSCRIPTION AUTONOME D'UN LOUEUR — depuis le site ou l'application.
//
// Le demandeur arrive en « en_attente » : il ne publie rien tant qu'un admin
// n'a pas validé. C'est volontaire — n'importe qui peut remplir un formulaire,
// et une flotte de véhicules engage la responsabilité de la plateforme.
//
// L'écriture passe par le rôle de service parce que la table `loueurs` n'a
// aucune politique d'INSERT : laisser un visiteur écrire directement lui
// permettrait de se déclarer « actif » du même geste.
// ============================================================================

type Res = { ok: true } | { ok: false; error: string }

const TYPES = ["particulier", "agence", "societe_taxi", "entreprise"]

export interface DemandeLoueur {
  type: string
  raison_sociale?: string
  nom_contact: string
  telephone: string
  email: string
  motdepasse: string
  ville?: string
  quartier?: string
  nombre_vehicules?: string
  message?: string
}

export async function deposerDemandeLoueur(d: DemandeLoueur): Promise<Res> {
  const nom = (d.raison_sociale?.trim() || d.nom_contact?.trim() || "").slice(0, 120)
  const tel = d.telephone?.trim() ?? ""
  const email = d.email?.trim().toLowerCase() ?? ""

  if (!nom) return { ok: false, error: "Indiquez votre nom ou celui de votre société." }
  if (tel.replace(/\D/g, "").length < 8) return { ok: false, error: "Numéro de téléphone incomplet." }
  if (!email.includes("@")) return { ok: false, error: "Adresse e-mail invalide." }
  if ((d.motdepasse ?? "").length < 8) return { ok: false, error: "Mot de passe : 8 caractères minimum." }

  const admin = createAdminClient()

  // Un même téléphone ne peut pas déposer deux fois : sans ce garde, un
  // formulaire renvoyé deux fois créerait deux dossiers que l'admin devrait
  // départager à la main.
  const { data: deja } = await admin.from("loueurs")
    .select("id, statut").eq("telephone", tel).maybeSingle()
  if (deja) {
    const s = (deja as { statut: string }).statut
    return {
      ok: false,
      error: s === "refuse"
        ? "Une demande a déjà été déposée avec ce numéro et n'a pas été retenue. Contactez-nous."
        : "Une demande existe déjà avec ce numéro. Nous vous recontactons rapidement.",
    }
  }

  const { data: cree, error: cErr } = await admin.auth.admin.createUser({
    email, password: d.motdepasse, email_confirm: true,
    user_metadata: { nom, telephone: tel },
  })
  if (cErr || !cree.user) {
    if (cErr?.message?.toLowerCase().includes("already")) {
      return { ok: false, error: "Un compte existe déjà avec cet e-mail. Connectez-vous." }
    }
    console.error("INAYA-LOUEUR-020", cErr)
    return { ok: false, error: "Échec de la création du compte. Réessayez." }
  }

  await admin.from("profiles").update({
    role: "loueur", nom, telephone: tel,
  } as never).eq("id", cree.user.id)

  const notes = [
    d.nombre_vehicules ? `Véhicules annoncés : ${d.nombre_vehicules}` : null,
    d.message?.trim() ? `Message : ${d.message.trim()}` : null,
  ].filter(Boolean).join("\n") || null

  const { error } = await admin.from("loueurs").insert({
    profile_id: cree.user.id,
    type: TYPES.includes(d.type) ? d.type : "particulier",
    raison_sociale: d.raison_sociale?.trim() || null,
    nom_contact: d.nom_contact?.trim() || null,
    telephone: tel,
    email,
    ville: d.ville?.trim() || null,
    quartier: d.quartier?.trim() || null,
    statut: "en_attente",
    notes_internes: notes,
  } as never)

  if (error) {
    // Le compte d'authentification vient d'être créé : on le retire, sinon
    // l'e-mail reste pris par un compte qui ne mène à aucun dossier.
    await admin.auth.admin.deleteUser(cree.user.id).catch(() => {})
    console.error("INAYA-LOUEUR-021", error)
    return { ok: false, error: "Échec de l'enregistrement de la demande." }
  }

  return { ok: true }
}
