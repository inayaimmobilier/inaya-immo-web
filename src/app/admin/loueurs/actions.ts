"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

// ============================================================================
// LOUEURS — propriétaires de véhicules confiés à la plateforme.
//
// Deux voies d'entrée, et elles n'ont pas les mêmes droits :
//   - l'ADMIN crée un loueur, éventuellement sans compte de connexion. Beaucoup
//     de propriétaires ne veulent pas d'application : ils confient une voiture
//     et attendent un appel. Exiger un e-mail les aurait exclus.
//   - le PROPRIÉTAIRE s'inscrit lui-même depuis le site ou l'application ; il
//     arrive alors en « en_attente » et ne peut rien publier avant validation.
//
// Toutes les écritures passent ici, avec le rôle de service. La table `loueurs`
// n'a volontairement AUCUNE politique d'écriture : un loueur qui pourrait
// changer son propre statut ou sa commission n'aurait plus rien à demander.
// ============================================================================

type Res = { ok: true; id?: string } | { ok: false; error: string }

const STAFF = ["super_admin", "admin"]

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return !!role && STAFF.includes(role)
}

export interface LoueurInput {
  type: string
  raison_sociale?: string | null
  nom_contact?: string | null
  telephone: string
  telephone_2?: string | null
  email?: string | null
  adresse?: string | null
  ville?: string | null
  quartier?: string | null
  numero_identification?: string | null
  commission_pourcent?: number
  contrat_debut?: string | null
  contrat_fin?: string | null
  paiement_mode?: string | null
  paiement_details?: string | null
  notes_internes?: string | null
  /** Mot de passe : présent = on ouvre aussi un accès à l'espace loueur. */
  motdepasse?: string | null
}

const TYPES = ["particulier", "agence", "societe_taxi", "entreprise"]
const STATUTS = ["en_attente", "actif", "suspendu", "refuse"]

/** Le nom affiché : raison sociale pour une société, nom du contact sinon. */
function nomAffiche(i: LoueurInput): string {
  return (i.raison_sociale?.trim() || i.nom_contact?.trim() || "Loueur").slice(0, 120)
}

function nettoyer(i: LoueurInput): Record<string, unknown> {
  return {
    type: TYPES.includes(i.type) ? i.type : "particulier",
    raison_sociale: i.raison_sociale?.trim() || null,
    nom_contact: i.nom_contact?.trim() || null,
    telephone: i.telephone.trim(),
    telephone_2: i.telephone_2?.trim() || null,
    email: i.email?.trim().toLowerCase() || null,
    adresse: i.adresse?.trim() || null,
    ville: i.ville?.trim() || null,
    quartier: i.quartier?.trim() || null,
    numero_identification: i.numero_identification?.trim() || null,
    commission_pourcent: Number.isFinite(i.commission_pourcent) ? i.commission_pourcent : 0,
    contrat_debut: i.contrat_debut || null,
    contrat_fin: i.contrat_fin || null,
    paiement_mode: i.paiement_mode?.trim() || null,
    paiement_details: i.paiement_details?.trim() || null,
    notes_internes: i.notes_internes?.trim() || null,
  }
}

export async function creerLoueur(input: LoueurInput): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Action réservée aux administrateurs." }
  if (!input.telephone?.trim()) return { ok: false, error: "Le téléphone est obligatoire." }
  if (!input.raison_sociale?.trim() && !input.nom_contact?.trim()) {
    return { ok: false, error: "Indiquez une raison sociale ou un nom de contact." }
  }

  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Accès à l'espace loueur : seulement si l'admin fournit e-mail ET mot de
  // passe. Créer un compte sans mot de passe laisserait un accès inutilisable
  // que personne ne penserait à réparer.
  let profileId: string | null = null
  const email = input.email?.trim().toLowerCase()
  if (email && input.motdepasse) {
    if (input.motdepasse.length < 8) return { ok: false, error: "Mot de passe : 8 caractères minimum." }
    const { data: cree, error: cErr } = await admin.auth.admin.createUser({
      email, password: input.motdepasse, email_confirm: true,
      user_metadata: { nom: nomAffiche(input), telephone: input.telephone.trim() },
    })
    if (cErr || !cree.user) {
      if (cErr?.message?.toLowerCase().includes("already")) {
        return { ok: false, error: "Un compte existe déjà avec cet e-mail." }
      }
      console.error("INAYA-LOUEUR-010", cErr)
      return { ok: false, error: "Échec de la création du compte de connexion." }
    }
    profileId = cree.user.id
    await admin.from("profiles").update({
      role: "loueur", nom: nomAffiche(input), telephone: input.telephone.trim(),
    } as never).eq("id", profileId)
  }

  const { data, error } = await admin.from("loueurs").insert({
    ...nettoyer(input),
    profile_id: profileId,
    // Créé par l'admin = déjà validé : il n'y a personne d'autre à convaincre.
    statut: "actif",
    cree_par: user?.id ?? null,
  } as never).select("id").single()

  if (error) {
    // Le compte d'authentification a pu être créé juste avant : on le retire,
    // sinon l'e-mail reste pris par un compte qui ne mène nulle part.
    if (profileId) await admin.auth.admin.deleteUser(profileId).catch(() => {})
    console.error("INAYA-LOUEUR-011", error)
    return { ok: false, error: "Échec de l'enregistrement du loueur." }
  }

  revalidatePath("/admin/loueurs")
  return { ok: true, id: (data as { id: string }).id }
}

export async function majLoueur(id: string, input: LoueurInput): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Action réservée aux administrateurs." }
  if (!input.telephone?.trim()) return { ok: false, error: "Le téléphone est obligatoire." }

  const admin = createAdminClient()
  const { error } = await admin.from("loueurs")
    .update({ ...nettoyer(input), updated_at: new Date().toISOString() } as never)
    .eq("id", id)
  if (error) {
    console.error("INAYA-LOUEUR-012", error)
    return { ok: false, error: "Échec de l'enregistrement." }
  }
  revalidatePath("/admin/loueurs")
  return { ok: true }
}

/**
 * Validation, suspension, refus.
 *
 * Suspendre coupe TOUT : `mon_loueur_id()` ne renvoie que les loueurs actifs,
 * donc l'espace loueur se vide et ses véhicules cessent d'être modifiables.
 * Les annonces déjà publiées, elles, restent en ligne — c'est un choix : une
 * suspension administrative ne doit pas faire disparaître des véhicules qu'un
 * client est peut-être en train de réserver. Pour les retirer, il faut les
 * dépublier explicitement.
 */
export async function changerStatutLoueur(
  id: string, statut: string, motif?: string,
): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Action réservée aux administrateurs." }
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut inconnu." }
  if (statut === "refuse" && !motif?.trim()) {
    return { ok: false, error: "Indiquez le motif du refus — le demandeur doit savoir pourquoi." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("loueurs").update({
    statut,
    motif_refus: statut === "refuse" ? motif!.trim() : null,
    updated_at: new Date().toISOString(),
  } as never).eq("id", id)
  if (error) {
    console.error("INAYA-LOUEUR-013", error)
    return { ok: false, error: "Échec du changement de statut." }
  }
  revalidatePath("/admin/loueurs")
  return { ok: true }
}

/**
 * Suppression.
 *
 * Refusée dès qu'un véhicule existe : la contrainte de clé étrangère cascade,
 * et l'on effacerait toute la flotte — y compris l'historique des locations qui
 * y est rattaché. Suspendre est presque toujours ce que l'on voulait faire.
 */
export async function supprimerLoueur(id: string): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Action réservée aux administrateurs." }
  const admin = createAdminClient()

  const { count } = await admin.from("vehicules")
    .select("id", { count: "exact", head: true }).eq("loueur_id", id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Ce loueur a ${count} véhicule(s). Supprimez-les d'abord, ou suspendez le compte.`,
    }
  }

  const { data: l } = await admin.from("loueurs").select("profile_id").eq("id", id).maybeSingle()
  const profileId = (l as { profile_id: string | null } | null)?.profile_id ?? null

  const { error } = await admin.from("loueurs").delete().eq("id", id)
  if (error) {
    console.error("INAYA-LOUEUR-014", error)
    return { ok: false, error: "Échec de la suppression." }
  }
  if (profileId) await admin.auth.admin.deleteUser(profileId).catch(() => {})

  revalidatePath("/admin/loueurs")
  return { ok: true }
}

/**
 * Ouvre un accès à l'espace loueur à un loueur qui n'en avait pas.
 * Cas courant : le partenaire a d'abord été saisi par un agent, puis demande
 * à suivre sa flotte lui-même.
 */
export async function ouvrirAcces(id: string, email: string, motdepasse: string): Promise<Res> {
  if (!await requireAdmin()) return { ok: false, error: "Action réservée aux administrateurs." }
  if (!email.trim() || motdepasse.length < 8) {
    return { ok: false, error: "E-mail et mot de passe (8 caractères minimum) requis." }
  }

  const admin = createAdminClient()
  const { data: l } = await admin.from("loueurs")
    .select("id, profile_id, raison_sociale, nom_contact, telephone").eq("id", id).maybeSingle()
  const loueur = l as {
    profile_id: string | null; raison_sociale: string | null
    nom_contact: string | null; telephone: string
  } | null
  if (!loueur) return { ok: false, error: "Loueur introuvable." }
  if (loueur.profile_id) return { ok: false, error: "Ce loueur a déjà un accès." }

  const nom = loueur.raison_sociale || loueur.nom_contact || "Loueur"
  const { data: cree, error: cErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(), password: motdepasse, email_confirm: true,
    user_metadata: { nom, telephone: loueur.telephone },
  })
  if (cErr || !cree.user) {
    if (cErr?.message?.toLowerCase().includes("already")) {
      return { ok: false, error: "Un compte existe déjà avec cet e-mail." }
    }
    return { ok: false, error: "Échec de la création de l'accès." }
  }

  await admin.from("profiles").update({
    role: "loueur", nom, telephone: loueur.telephone,
  } as never).eq("id", cree.user.id)
  await admin.from("loueurs").update({
    profile_id: cree.user.id, email: email.trim().toLowerCase(),
  } as never).eq("id", id)

  revalidatePath("/admin/loueurs")
  return { ok: true }
}
