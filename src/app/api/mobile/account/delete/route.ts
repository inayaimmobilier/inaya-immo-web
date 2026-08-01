import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

// ============================================================================
// SUPPRESSION DU COMPTE, demandée depuis l'application.
//
// Google Play l'exige depuis 2024 pour toute application permettant de créer un
// compte : la suppression doit être possible DANS l'application, et par une URL
// accessible sans installer l'application (voir /supprimer-mon-compte).
//
// Principe retenu : on efface tout ce qui identifie la personne (profil,
// alertes, favoris, jetons de notification) et on ANONYMISE ce qui doit rester
// pour la cohérence du service — une demande de visite déjà traitée par un
// agent, une annonce publiée. Supprimer ces lignes casserait le suivi des
// dossiers et la comptabilité ; y laisser le nom et le numéro trahirait la
// demande de suppression. On retire donc l'identité, pas l'historique.
// ============================================================================
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "non_authentifie" }, { status: 401 })

  const admin = createAdminClient()

  // Un compte du personnel ne se supprime pas depuis l'application : cela
  // couperait des accès de gestion sans aucun contrôle.
  const { data: prof } = await admin.from("profiles").select("role, telephone").eq("id", userId).maybeSingle()
  const p = prof as { role: string | null; telephone: string | null } | null
  if (p?.role && ["super_admin", "admin", "moderateur", "agent"].includes(p.role)) {
    return NextResponse.json(
      { error: "Ce compte est un compte professionnel. Contactez l'administrateur pour le supprimer." },
      { status: 403 },
    )
  }

  const echecs: string[] = []
  // `PromiseLike` et non `Promise` : les requêtes Supabase sont des « thenables »
  // qui n'exposent ni `catch` ni `finally`.
  const tenter = async (libelle: string, fn: () => PromiseLike<{ error: unknown }>) => {
    try {
      const { error } = await fn()
      if (error) { echecs.push(libelle); console.error("INAYA-DEL-COMPTE", libelle, error) }
    } catch (e) { echecs.push(libelle); console.error("INAYA-DEL-COMPTE", libelle, e) }
  }

  // 1) Données rattachées au compte : suppression pure.
  await tenter("jetons push", () => admin.from("device_tokens").delete().eq("user_id", userId))
  await tenter("favoris", () => admin.from("favoris").delete().eq("user_id", userId))
  await tenter("notifications", () => admin.from("notifications").delete().eq("user_id", userId))

  // 2) Alertes de recherche : elles portent le numéro, on les retire.
  await tenter("alertes", () => admin.from("search_requests").delete().eq("user_id", userId))
  const tel = p?.telephone
  if (tel) {
    await tenter("alertes (numéro)", () =>
      admin.from("search_requests").delete().eq("contact_telephone", tel))
  }

  // 3) Demandes de visite : anonymisées, jamais supprimées (suivi des dossiers).
  await tenter("demandes", () => admin.from("leads")
    .update({ client_id: null, contact_nom: "Compte supprimé", contact_telephone: null, contact_email: null } as never)
    .eq("client_id", userId))

  // 4) Compte d'authentification et profil.
  await tenter("profil", () => admin.from("profiles").delete().eq("id", userId))
  try {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) { echecs.push("authentification"); console.error("INAYA-DEL-COMPTE", "auth", error.message) }
  } catch (e) { echecs.push("authentification"); console.error("INAYA-DEL-COMPTE", "auth", e) }

  if (echecs.length > 0) {
    // Suppression partielle : on le dit plutôt que d'annoncer une réussite.
    return NextResponse.json({
      ok: false,
      error: "La suppression n'a pas pu être menée entièrement. Notre équipe la termine sous 48 h.",
      partiel: echecs,
    }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
