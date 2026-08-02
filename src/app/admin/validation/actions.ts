"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { analyserDemande } from "@/lib/demande-completude"
import { chargerVocabulaireLieux } from "@/lib/vocabulaire-lieux"
import { runMatchingForRequest } from "@/lib/matching"
import type { UserRole, PropertyType, PropertyCat } from "@/types/database"

// ============================================================================
// VALIDATION DES DEMANDES.
//
// Une demande dont un critère clé n'est pas établi n'envoie rien. Ces actions
// sont le seul moyen de la débloquer : un humain vérifie, corrige, puis valide.
// ============================================================================

type Res = { ok: true; n?: number } | { ok: false; error: string }

/**
 * VALIDER engage la responsabilité de l'agence : le client se remet à recevoir
 * des messages. On le réserve donc aux rôles qui répondent des envois, agents
 * exclus — ils créent des demandes, ils ne décident pas des campagnes d'alerte.
 */
const VALIDATEURS: UserRole[] = ["super_admin", "admin", "moderateur"]

async function exigerValidateur() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return role && VALIDATEURS.includes(role) ? user.id : null
}

export interface CriteresValides {
  type_offre: PropertyType | null
  categories: PropertyCat[] | null
  commune: string | null
  zones: string[] | null
  budget_max: number | null
  nb_pieces_min: number | null
}

/**
 * Enregistre les corrections du modérateur ET valide la demande.
 *
 * Les deux gestes sont indissociables : valider sans enregistrer laisserait
 * partir des alertes sur les critères incomplets qu'on venait de corriger à
 * l'écran, ce qui serait pire que ne rien faire.
 */
export async function validerDemande(id: string, c: CriteresValides): Promise<Res> {
  const validateurId = await exigerValidateur()
  if (!validateurId) return { ok: false, error: "Non autorisé" }

  const manquants: string[] = []
  if (!c.type_offre) manquants.push("type_offre")
  if (!c.categories?.length) manquants.push("categorie")
  if (!c.commune?.trim()) manquants.push("commune")
  if (!c.zones?.length) manquants.push("quartier")
  if (c.budget_max == null) manquants.push("budget")
  if (c.categories?.some(x => x === "maison" || x === "appartement") && c.nb_pieces_min == null) {
    manquants.push("nb_pieces")
  }
  // On refuse de valider une demande encore incomplète : le modérateur croirait
  // avoir débloqué le client alors que rien ne partirait — ou pire, que des
  // alertes partiraient sur des critères qu'on sait faux.
  if (manquants.length > 0) {
    return { ok: false, error: `Critères encore manquants : ${manquants.join(", ")}` }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("search_requests").update({
    type_offre: c.type_offre,
    categories: c.categories,
    commune: c.commune?.trim() || null,
    zones: c.zones,
    budget_max: c.budget_max,
    nb_pieces_min: c.nb_pieces_min,
    statut_validation: "validee",
    criteres_manquants: null,
    validee_par: validateurId,
    validee_le: new Date().toISOString(),
  } as never).eq("id", id)
  if (error) return { ok: false, error: error.message }

  // Rattrapage : la demande a pu passer à côté d'annonces publiées pendant
  // qu'elle attendait. Sans cela, valider ne servirait qu'aux biens à venir.
  await runMatchingForRequest(id, { notify: true }).catch(() => {})

  revalidatePath("/admin/validation")
  revalidatePath("/admin/recherches")
  return { ok: true }
}

/** Demande inexploitable : conservée pour l'historique, jamais alertée. */
export async function rejeterDemande(id: string): Promise<Res> {
  const validateurId = await exigerValidateur()
  if (!validateurId) return { ok: false, error: "Non autorisé" }

  const { error } = await createAdminClient().from("search_requests").update({
    statut_validation: "rejetee",
    validee_par: validateurId,
    validee_le: new Date().toISOString(),
  } as never).eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/admin/validation")
  return { ok: true }
}

/**
 * Recalcule la complétude de toutes les demandes actives en attente.
 *
 * Indispensable après la migration : la colonne a pour défaut `a_valider`, si
 * bien que TOUTE demande s'est retrouvée bloquée — y compris celles dont les
 * critères étaient déjà tous connus. Sans ce passage, un modérateur devrait
 * rouvrir à la main des centaines de demandes qui n'avaient aucun problème.
 *
 * Ne touche JAMAIS aux `validee` ni aux `rejetee` : une décision humaine ne se
 * défait pas par un recalcul automatique.
 */
export async function recalculerCompletude(): Promise<Res> {
  const validateurId = await exigerValidateur()
  if (!validateurId) return { ok: false, error: "Non autorisé" }

  const admin = createAdminClient()
  const vocab = await chargerVocabulaireLieux()
  let debloquees = 0

  // Pagination : PostgREST plafonne à 1000 lignes, et `limit` ne relève pas ce
  // plafond. Sans `order` + `range`, on ne traiterait qu'un millier de lignes
  // arbitraires et le reste resterait muet sans que personne ne le sache.
  const PAS = 500
  for (let debut = 0; debut < 50_000; debut += PAS) {
    const { data, error } = await admin.from("search_requests")
      .select("id,type_offre,categories,commune,zones,budget_min,budget_max,nb_pieces_min,description_libre")
      .eq("statut", "active")
      .eq("statut_validation", "a_valider")
      .order("created_at", { ascending: true })
      .range(debut, debut + PAS - 1)
    if (error) return { ok: false, error: error.message }

    const lot = (data ?? []) as Parameters<typeof analyserDemande>[0][] & { id: string }[]
    if (lot.length === 0) break

    for (const r of lot) {
      const a = analyserDemande(r, vocab)
      if (a.complete) {
        await admin.from("search_requests").update({
          statut_validation: "complete",
          criteres_manquants: null,
          // On INSCRIT ce que l'analyse a établi : sans cela, la demande
          // resterait « complète » avec des colonnes vides, et le moteur
          // devrait tout relire à chaque annonce publiée.
          type_offre: a.resolus.type_offre,
          categories: a.resolus.categories,
          commune: a.resolus.commune,
          nb_pieces_min: a.resolus.nb_pieces_min,
          budget_max: r.budget_max ?? a.resolus.budget,
        } as never).eq("id", r.id)
        debloquees++
      } else {
        // On consigne CE QUI MANQUE : le modérateur doit lire le motif, pas le
        // chercher lui-même dans un texte libre.
        await admin.from("search_requests")
          .update({ criteres_manquants: a.manquants } as never).eq("id", r.id)
      }
    }
    if (lot.length < PAS) break
  }

  revalidatePath("/admin/validation")
  return { ok: true, n: debloquees }
}
