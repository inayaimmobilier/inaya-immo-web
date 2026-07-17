"use server"

import { createAdminClient, createClient } from "@/lib/supabase/server"
import { moderateProperty } from "@/lib/moderation"
import { revalidatePath } from "next/cache"

export interface PublierResult {
  ok: boolean
  propertyId?: string
  error?: string
}

export async function publierAnnonce(fd: FormData): Promise<PublierResult> {
  const admin = createAdminClient()
  // Rattache le bien au compte connecté (propriétaire diffuseur) → « Mes biens ».
  const { data: { user } } = await (await createClient()).auth.getUser()

  // ── Champs requis ──────────────────────────────────────────────────────────
  const type_offre = fd.get("type_offre") as string
  const categorie = fd.get("categorie") as string
  const prix_raw = fd.get("prix") as string
  const contact_nom = (fd.get("contact_nom") as string | null)?.trim()
  const contact_phone = (fd.get("contact_phone") as string | null)?.trim()

  // ── Coordonnées du propriétaire réel (saisies par le staff pour son compte) ──
  const proprietaire_nom = (fd.get("proprietaire_nom") as string | null)?.trim() || null
  const proprietaire_telephone = (fd.get("proprietaire_telephone") as string | null)?.trim() || null
  const proprietaire_email = (fd.get("proprietaire_email") as string | null)?.trim() || null
  const proprietaire_notes = (fd.get("proprietaire_notes") as string | null)?.trim() || null

  if (!type_offre || !categorie || !prix_raw || !contact_nom || !contact_phone) {
    return { ok: false, error: "Veuillez remplir tous les champs obligatoires." }
  }
  const prix = Number(prix_raw)
  if (isNaN(prix) || prix <= 0) return { ok: false, error: "Prix invalide." }

  // ── Champs optionnels ──────────────────────────────────────────────────────
  const titre_raw = (fd.get("titre") as string | null)?.trim()
  let description = (fd.get("description") as string | null)?.trim() || null
  const quartier = (fd.get("quartier") as string | null)?.trim() || null
  const surface = fd.get("surface") ? Number(fd.get("surface")) : null
  const nb_pieces = fd.get("nb_pieces") ? Number(fd.get("nb_pieces")) : null
  const nb_chambres = fd.get("nb_chambres") ? Number(fd.get("nb_chambres")) : null
  const meuble = fd.get("meuble") === "oui"

  // ── Spécifique résidences meublées ──────────────────────────────────────────
  const isResidence = type_offre === "residence_meublee"
  const residTypeLabel = (fd.get("residence_type_label") as string | null)?.trim() || null
  const residAutre = (fd.get("residence_autre") as string | null)?.trim() || null
  const tarif_periode = isResidence ? ((fd.get("tarif_periode") as string | null)?.trim() || "nuit") : null
  const forfaits = (fd.get("forfaits") as string | null)?.trim() || null

  // ── Conditions d'accès au bien ────────────────────────────────────────────
  // Location (maison, appartement, studio, local…) : mois de caution/avance/agence.
  const numOrNull = (v: FormDataEntryValue | null) => { const n = Number(v); return v && !isNaN(n) ? n : null }
  const mois_caution = type_offre === "location" ? numOrNull(fd.get("mois_caution")) : null
  const mois_avance  = type_offre === "location" ? numOrNull(fd.get("mois_avance"))  : null
  const mois_agence  = type_offre === "location" ? numOrNull(fd.get("mois_agence"))  : null
  // Cession (fonds de commerce, bail à céder — magasins, entrepôts, locaux commerciaux) :
  // pas-de-porte, loyer après reprise, conditions d'acquisition.
  const cout_cession = type_offre === "cession" ? numOrNull(fd.get("cout_cession")) : null
  const loyer_cession = type_offre === "cession" ? numOrNull(fd.get("loyer_cession")) : null
  const conditions_acquisition = type_offre === "cession"
    ? ((fd.get("conditions_acquisition") as string | null)?.trim() || null) : null

  // Pour une résidence « autre », on précise le type dans la description.
  // Les forfaits sont stockés dans leur colonne dédiée (pas dans la description).
  if (isResidence && residAutre) {
    description = [description, `Type : ${residAutre}.`].filter(Boolean).join("\n\n")
  }

  // Auto-titre si non fourni
  const CAT_LABEL: Record<string, string> = {
    maison: "Maison", appartement: "Appartement", studio: "Studio",
    terrain: "Terrain", local_commercial: "Local commercial",
    bureau: "Bureau", magasin: "Magasin", autre: "Bien",
  }
  const TYPE_LABEL: Record<string, string> = { location: "à louer", vente: "à vendre", cession: "à céder", residence_meublee: "meublé à louer" }
  // Titre : pour une résidence, basé sur le type choisi ("autre" → précision saisie).
  const residNom = residAutre || residTypeLabel || "Résidence meublée"
  const titre = titre_raw || (isResidence
    ? `${residNom}${quartier ? ` – ${quartier}` : " à Bouaké"}`.trim()
    : `${CAT_LABEL[categorie] ?? "Bien"} ${TYPE_LABEL[type_offre] ?? ""} ${quartier ? `– ${quartier}` : "à Bouaké"}`.trim())

  // ── Création de l'annonce ──────────────────────────────────────────────────
  const insertPayload: Record<string, unknown> = {
    titre,
    description,
    type_offre,
    categorie,
    prix,
    charges: 0,
    quartier,
    ville: "Bouaké",
    meuble,
    surface: surface || null,
    nb_pieces: nb_pieces || null,
    nb_chambres: nb_chambres || null,
    tarif_periode,
    forfaits: isResidence ? forfaits : null,
    mois_caution, mois_avance, mois_agence,
    cout_cession, loyer_cession, conditions_acquisition,
    proprietaire_nom, proprietaire_telephone, proprietaire_email, proprietaire_notes,
    statut: "en_attente_validation",
    source: "proprietaire",
  }

  let { data: prop, error: propErr } = await admin
    .from("properties").insert(insertPayload as never).select("id").single()

  // 42703 = colonne récente absente (migrations 010/014/020/023 non appliquées) → réessai sans.
  if (propErr?.code === "42703") {
    const {
      tarif_periode: _tp, forfaits: _f,
      mois_caution: _mc, mois_avance: _ma, mois_agence: _mg,
      cout_cession: _cc, loyer_cession: _lc, conditions_acquisition: _ca,
      proprietaire_nom: _pn, proprietaire_telephone: _pt, proprietaire_email: _pe, proprietaire_notes: _pnotes,
      ...base
    } = insertPayload
    // On reverse les champs perdus dans la description en repli, pour ne rien perdre.
    const lost: string[] = []
    if (forfaits) lost.push(`Forfaits spéciaux : ${forfaits}`)
    if (mois_caution != null || mois_avance != null || mois_agence != null) {
      lost.push(`Conditions de location : ${mois_caution ?? "?"} mois de caution, ${mois_avance ?? "?"} mois d'avance, ${mois_agence ?? "?"} mois d'agence.`)
    }
    if (cout_cession != null) lost.push(`Pas de porte / coût de cession : ${cout_cession} FCFA.`)
    if (loyer_cession != null) lost.push(`Loyer après reprise : ${loyer_cession} FCFA/mois.`)
    if (conditions_acquisition) lost.push(`Conditions d'acquisition : ${conditions_acquisition}`)
    if (proprietaire_nom || proprietaire_telephone || proprietaire_email || proprietaire_notes) {
      lost.push(`Propriétaire (interne) : ${[proprietaire_nom, proprietaire_telephone, proprietaire_email, proprietaire_notes].filter(Boolean).join(" · ")}`)
    }
    if (lost.length) base.description = [base.description, ...lost].filter(Boolean).join("\n\n")
    const retry = await admin.from("properties").insert(base as never).select("id").single()
    prop = retry.data; propErr = retry.error
  }

  if (propErr || !prop) {
    console.error("INAYA-STORE-030", propErr)
    return { ok: false, error: "Erreur lors de l'enregistrement. Réessayez." }
  }

  const propertyId = (prop as { id: string }).id

  // ── Enregistrement du publieur ─────────────────────────────────────────────
  const pubRow: Record<string, unknown> = {
    property_id: propertyId,
    publisher_id: user?.id ?? null,
    contact_nom,
    contact_phone,
    canal: "web",
    source: "proprietaire",
    publie_le: new Date().toISOString(),
  }
  let { error: pubErr } = await admin.from("property_publishers").insert(pubRow as never)
  if (pubErr?.code === "42703") { // publisher_id absent → réessai sans
    const { publisher_id: _p, ...base } = pubRow
    pubErr = (await admin.from("property_publishers").insert(base as never)).error
  }
  if (pubErr) console.error("INAYA-STORE-031", pubErr.message)

  // Modération IA asynchrone (best-effort — n'empêche pas la confirmation à l'utilisateur)
  void moderateProperty(propertyId, {
    titre,
    description,
    type_offre,
    categorie,
    prix,
    quartier,
    ville: "Bouaké",
  })

  revalidatePath("/admin/annonces")
  return { ok: true, propertyId }
}
