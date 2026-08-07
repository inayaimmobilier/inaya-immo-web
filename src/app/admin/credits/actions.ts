"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { mouvementAdmin } from "@/lib/credits"
import type { UserRole } from "@/types/database"

// ============================================================================
// ADMINISTRATION DES CRÉDITS.
//
// Ces actions déplacent de l'argent. Trois principes s'appliquent :
//
//   — Le rôle est vérifié DANS CHAQUE action, et pas seulement à l'entrée de la
//     page : une server action est un POST dont l'identifiant circule dans le
//     paquet JavaScript, et rien n'oblige à la poster depuis /admin.
//   — Seuls `super_admin` et `admin` créditent. Un modérateur modère des
//     annonces, il n'ouvre pas la caisse.
//   — Le motif est obligatoire, et l'auteur est enregistré. Un mouvement sans
//     justification écrite est indéfendable le jour où un professionnel
//     conteste son solde.
// ============================================================================

type Res = { ok: true; message?: string } | { ok: false; error: string }

const CAISSE: UserRole[] = ["super_admin", "admin"]

/** Rend l'identifiant de l'administrateur habilité, ou null. */
async function caissier(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return role && CAISSE.includes(role) ? user.id : null
}

/** Ouvre le portefeuille d'un professionnel — c'est ce qui l'autorise à acheter. */
export async function ouvrirCompte(userId: string): Promise<Res> {
  const auteur = await caissier()
  if (!auteur) return { ok: false, error: "Action réservée à la direction." }
  if (!userId) return { ok: false, error: "Compte introuvable." }

  const { error } = await createAdminClient()
    .from("credit_wallets").upsert({ user_id: userId } as never, { onConflict: "user_id" })
  if (error) {
    console.error("INAYA-CREDIT-010", error)
    return { ok: false, error: "Ouverture impossible." }
  }
  revalidatePath("/admin/credits")
  return { ok: true, message: "Compte professionnel activé." }
}

/** Suspend ou rétablit. Le solde n'est pas touché : on bloque, on ne confisque pas. */
export async function suspendreCompte(userId: string, suspendu: boolean): Promise<Res> {
  const auteur = await caissier()
  if (!auteur) return { ok: false, error: "Action réservée à la direction." }

  const { error } = await createAdminClient()
    .from("credit_wallets").update({ suspendu } as never).eq("user_id", userId)
  if (error) return { ok: false, error: "Modification impossible." }
  revalidatePath("/admin/credits")
  return { ok: true, message: suspendu ? "Compte suspendu." : "Compte rétabli." }
}

/**
 * Recharge, remboursement ou correction.
 *
 * Un montant NÉGATIF retire du crédit ; la fonction SQL refusera de faire
 * passer le solde sous zéro.
 */
export async function crediter(form: FormData): Promise<Res> {
  const auteur = await caissier()
  if (!auteur) return { ok: false, error: "Action réservée à la direction." }

  const userId = String(form.get("user_id") || "")
  const montant = Number.parseInt(String(form.get("montant") || ""), 10)
  const type = String(form.get("type") || "recharge_admin")
  const motif = String(form.get("motif") || "")
  const reference = String(form.get("reference") || "")

  if (!userId) return { ok: false, error: "Compte introuvable." }
  if (!Number.isInteger(montant) || montant === 0) {
    return { ok: false, error: "Indiquez un montant, positif pour créditer, négatif pour retirer." }
  }
  if (!["recharge_admin", "remboursement", "ajustement"].includes(type)) {
    return { ok: false, error: "Type de mouvement invalide." }
  }
  if (!motif.trim()) {
    return { ok: false, error: "Le motif est obligatoire : il justifie le mouvement en cas de contestation." }
  }

  const r = await mouvementAdmin({
    userId, montant,
    type: type as "recharge_admin" | "remboursement" | "ajustement",
    motif, reference, auteur,
  })
  if (!r.ok) return r

  revalidatePath("/admin/credits")
  return { ok: true, message: `Nouveau solde : ${r.solde.toLocaleString("fr-FR")} crédits.` }
}

/** Met à jour une ligne de la grille tarifaire. */
export async function reglerTarif(form: FormData): Promise<Res> {
  const auteur = await caissier()
  if (!auteur) return { ok: false, error: "Action réservée à la direction." }

  const id = String(form.get("id") || "")
  const nombre = (k: string) => {
    const v = String(form.get(k) ?? "").replace(",", ".").trim()
    return v === "" ? null : Number(v)
  }

  const part = nombre("part_pourcent")
  if (part === null || !(part > 0 && part <= 100)) {
    return { ok: false, error: "La part prélevée doit être comprise entre 0 et 100 %." }
  }
  const min = nombre("cout_min") ?? 0
  const max = nombre("cout_max")
  if (max !== null && max < min) {
    return { ok: false, error: "Le plafond ne peut pas être inférieur au plancher." }
  }

  const { error } = await createAdminClient().from("credit_tarifs").update({
    actif: String(form.get("actif") || "") === "true",
    taux_commission: nombre("taux_commission"),
    part_pourcent: part,
    cout_min: Math.round(min),
    cout_max: max === null ? null : Math.round(max),
    cout_defaut: Math.round(nombre("cout_defaut") ?? 1000),
    updated_at: new Date().toISOString(),
  } as never).eq("id", id)

  if (error) {
    console.error("INAYA-CREDIT-011", error)
    return { ok: false, error: "Enregistrement refusé." }
  }
  revalidatePath("/admin/credits")
  return { ok: true, message: "Tarif enregistré." }
}

/**
 * Retire définitivement un numéro de la diffusion.
 *
 * Ces personnes ont publié dans un groupe WhatsApp sans consentir à ce que leur
 * contact soit revendu : leur demande de retrait doit être honorée tout de
 * suite, sans discussion.
 */
export async function retirerDeLaDiffusion(form: FormData): Promise<Res> {
  const auteur = await caissier()
  if (!auteur) return { ok: false, error: "Action réservée à la direction." }

  const tel = String(form.get("telephone") || "").replace(/[^0-9+]/g, "").trim()
  if (tel.replace(/\D/g, "").length < 8) return { ok: false, error: "Numéro invalide." }

  const { error } = await createAdminClient().from("contact_opt_out").upsert({
    telephone: tel,
    motif: String(form.get("motif") || "").trim().slice(0, 300) || null,
    created_by: auteur,
  } as never, { onConflict: "telephone" })

  if (error) return { ok: false, error: "Enregistrement refusé." }
  revalidatePath("/admin/credits")
  return { ok: true, message: "Ce numéro ne sera plus transmis." }
}

// ── RÉCLAMATIONS ───────────────────────────────────────────────────────────

/**
 * Tranche une réclamation.
 *
 * Le remboursement passe par le grand livre comme tout mouvement : il ne
 * « défait » pas le débit d'origine, il ajoute une écriture inverse. Effacer
 * l'écriture initiale ferait disparaître la trace de ce qui s'est réellement
 * passé, et c'est précisément cette trace qui protège les deux parties.
 *
 * L'achat n'est PAS supprimé : le professionnel garde le contact qu'il a déjà
 * lu. Le rembourser ET le lui reprendre serait une double peine ; le lui
 * laisser sans rembourser serait un vol. On rembourse, et il garde.
 */
export async function trancherReclamation(form: FormData): Promise<Res> {
  const auteur = await caissier()
  if (!auteur) return { ok: false, error: "Action réservée à la direction." }

  const id = String(form.get("id") || "")
  const decision = String(form.get("decision") || "")
  const note = String(form.get("note") || "").trim()
  if (!id) return { ok: false, error: "Réclamation introuvable." }
  if (decision !== "rembourser" && decision !== "refuser") {
    return { ok: false, error: "Décision invalide." }
  }
  // Un refus non motivé est incontestable pour l'agence, donc inacceptable.
  if (decision === "refuser" && !note) {
    return { ok: false, error: "Un refus doit être motivé — l'agence doit pouvoir le comprendre." }
  }

  const admin = createAdminClient()
  const { data } = await admin.from("contact_reclamations")
    .select("id, statut, user_id, unlock_id").eq("id", id).maybeSingle()
  const rec = data as unknown as { statut: string; user_id: string; unlock_id: string } | null
  if (!rec) return { ok: false, error: "Réclamation introuvable." }
  if (rec.statut !== "ouverte") return { ok: false, error: "Cette réclamation est déjà tranchée." }

  if (decision === "rembourser") {
    const { data: u } = await admin.from("contact_unlocks")
      .select("cout, property_id").eq("id", rec.unlock_id).single()
    const unlock = u as unknown as { cout: number; property_id: string }

    if (unlock.cout > 0) {
      const r = await mouvementAdmin({
        userId: rec.user_id,
        montant: unlock.cout,
        type: "remboursement",
        motif: `Réclamation ${id.slice(0, 8)} — ${note || "contact inexploitable"}`,
        auteur,
      })
      if (!r.ok) return r
    }
  }

  const { error } = await admin.from("contact_reclamations").update({
    statut: decision === "rembourser" ? "remboursee" : "refusee",
    decision_par: auteur,
    decision_le: new Date().toISOString(),
    decision_note: note || null,
  } as never).eq("id", id)

  if (error) {
    // Le remboursement est déjà passé : on le dit franchement plutôt que de
    // laisser croire que rien ne s'est produit, sans quoi un second clic
    // rembourserait deux fois.
    console.error("INAYA-CREDIT-012", error)
    return { ok: false, error: "Le crédit a été rendu mais la réclamation n'a pas pu être close. Vérifiez avant de recommencer." }
  }

  revalidatePath("/admin/credits")
  return { ok: true, message: decision === "rembourser" ? "Crédit rendu." : "Réclamation refusée." }
}
