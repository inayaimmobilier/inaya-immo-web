"use server"

import { randomUUID } from "crypto"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  notifyNewLead, notifyClientVisiteRecue, notifyProprietaireVisite, notifyStaff,
} from "@/lib/notifications"

type LeadResult = { ok: true } | { ok: false; error: string }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"

/**
 * Crée un lead (demande de visite / mise en relation) pour une annonce.
 * - Visiteur connecté  → client_id renseigné, insertion via son client.
 * - Visiteur anonyme   → contact_* renseignés, insertion serveur (service_role)
 *   car la RLS exige auth.uid() pour les inserts.
 * Le contact du propriétaire n'est JAMAIS exposé : la mise en relation se fait
 * par Inaya en interne (protection commission).
 */
export async function createLead(form: FormData): Promise<LeadResult> {
  const propertyId = String(form.get("property_id") || "")
  const nom = String(form.get("contact_nom") || "").trim()
  const tel = String(form.get("contact_telephone") || "").trim()
  const email = String(form.get("contact_email") || "").trim() || null
  const message = String(form.get("message") || "").trim() || null
  const reservation = form.get("est_residence") === "1"
  const sejour_nuits = form.get("res_nuits") ? Number(form.get("res_nuits")) : null
  const montant_estime = form.get("res_montant") ? Number(form.get("res_montant")) : null
  const creneau = String(form.get("creneau") || "").trim()

  if (!propertyId) return { ok: false, error: "Annonce introuvable." }
  if (!nom) return { ok: false, error: "Votre nom est requis." }
  if (!tel || tel.replace(/\D/g, "").length < 8)
    return { ok: false, error: "Un numéro de téléphone valide est requis." }

  // Vérifie que l'annonce existe et est publiée
  const anon = await createClient()
  const { data: { user } } = await anon.auth.getUser()
  const { data: propData } = await anon
    .from("properties").select("id, statut, titre, quartier").eq("id", propertyId).single()
  const prop = propData as { id: string; statut: string; titre: string; quartier: string | null } | null
  if (!prop || prop.statut !== "publie")
    return { ok: false, error: "Cette annonce n'est plus disponible." }

  const creneaux = creneau ? [{ souhaite: creneau }] : []

  // Jeton du lien de validation envoyé au propriétaire.
  const token = randomUUID()
  const payload: Record<string, unknown> = {
    property_id: propertyId,
    client_id: user?.id ?? null,
    contact_nom: nom,
    contact_telephone: tel,
    contact_email: email,
    canal: "web" as const,
    message,
    creneaux,
    statut: "nouveau" as const,
    validation_token: token,
    sejour_nuits,
    montant_estime,
  }

  // Insertion : client authentifié si possible (respecte la RLS et lie le lead),
  // sinon insertion serveur pour permettre les demandes anonymes.
  const db = user ? anon : createAdminClient()
  let { data: leadData, error } = await db.from("leads").insert(payload as never).select("id").single()

  // 42703 = colonne récente absente (migrations 018/022 non appliquées) → réessai sans.
  let hasToken = true
  if (error?.code === "42703") {
    hasToken = false
    const { validation_token: _t, sejour_nuits: _n, montant_estime: _m, ...base } = payload
    const retry = await db.from("leads").insert(base as never).select("id").single()
    leadData = retry.data; error = retry.error
  }
  if (error) {
    console.error("INAYA-DB-030", error)
    return { ok: false, error: "Échec de l'envoi de la demande. Réessayez." }
  }

  // Notifications (best-effort : n'échouent jamais la demande du client).
  try {
    // 1) Staff (admin + agents)
    await notifyNewLead({
      propertyTitre: prop.titre,
      quartier: prop.quartier,
      contactNom: nom,
      contactTel: tel,
      creneau: creneau || null,
      leadId: (leadData as unknown as { id: string }).id,
      propertyId,
    })

    // 2) Confirmation WhatsApp au client
    await notifyClientVisiteRecue({ contactTel: tel, contactNom: nom, propertyTitre: prop.titre, quartier: prop.quartier, reservation })

    // 3) Notification au propriétaire/publieur original avec lien de validation
    const admin = createAdminClient()
    const { data: pub } = await admin
      .from("property_publishers")
      .select("contact_phone")
      .eq("property_id", propertyId)
      .order("rang", { ascending: true })
      .limit(1)
      .maybeSingle()
    const ownerTel = (pub as { contact_phone: string | null } | null)?.contact_phone ?? null
    if (ownerTel) {
      await notifyProprietaireVisite({
        ownerTel,
        propertyTitre: prop.titre,
        quartier: prop.quartier,
        creneau: creneau || null,
        validationUrl: hasToken ? `${APP_URL}/rdv/${token}` : `${APP_URL}/admin/leads`,
        reservation,
      })
    }
  } catch (e) {
    console.error("INAYA-NOTIF-002", e)
  }

  return { ok: true }
}

type ReportResult = { ok: true } | { ok: false; error: string }

/**
 * Signalement d'une annonce par un visiteur (connecté ou anonyme).
 * Le motif est optionnel. Persiste dans `signalements` (via service_role) et
 * alerte le staff. Résilient si la migration 031 n'est pas encore appliquée
 * (42P01) : le signalement n'est pas perdu, il reste porté par la notification.
 */
export async function signalerAnnonce(form: FormData): Promise<ReportResult> {
  const propertyId = String(form.get("property_id") || "")
  const categorie = String(form.get("categorie") || "").trim() || null
  const motif = String(form.get("motif") || "").trim() || null
  const contact = String(form.get("contact") || "").trim() || null
  if (!propertyId) return { ok: false, error: "Annonce introuvable." }

  const anon = await createClient()
  const { data: { user } } = await anon.auth.getUser()
  const { data: propData } = await anon
    .from("properties").select("id, titre, quartier").eq("id", propertyId).single()
  const prop = propData as { id: string; titre: string; quartier: string | null } | null
  if (!prop) return { ok: false, error: "Cette annonce n'existe plus." }

  const admin = createAdminClient()
  const { error } = await admin.from("signalements").insert({
    property_id: propertyId,
    user_id: user?.id ?? null,
    categorie,
    motif,
    contact,
    statut: "nouveau",
  } as never)
  // Table absente (migration 031 non appliquée) : 42P01 (Postgres) ou PGRST205
  // (cache de schéma PostgREST). On ne bloque pas — le staff est tout de même
  // alerté ci-dessous, le signalement n'est pas perdu.
  const tableMissing = error?.code === "42P01" || error?.code === "PGRST205"
  if (error && !tableMissing) {
    console.error("INAYA-DB-060", error)
    return { ok: false, error: "Échec de l'envoi du signalement. Réessayez." }
  }

  // Alerte staff (best-effort).
  try {
    const lieu = prop.quartier ? ` (${prop.quartier})` : ""
    const details = [categorie && `Catégorie : ${categorie}`, motif && `Motif : ${motif}`, contact && `Contact : ${contact}`]
      .filter(Boolean).join(" · ")
    await notifyStaff({
      type: "signalement",
      titre: "Annonce signalée",
      contenu: `« ${prop.titre} »${lieu} a été signalée.${details ? " " + details : " (sans motif précisé)"}`,
      payload: { property_id: propertyId, categorie, motif },
    })
  } catch (e) {
    console.error("INAYA-NOTIF-004", e)
  }

  return { ok: true }
}
