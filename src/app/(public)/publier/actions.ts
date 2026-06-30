"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { moderateProperty } from "@/lib/moderation"
import { revalidatePath } from "next/cache"

export interface PublierResult {
  ok: boolean
  propertyId?: string
  error?: string
}

export async function publierAnnonce(fd: FormData): Promise<PublierResult> {
  const admin = createAdminClient()

  // ── Champs requis ──────────────────────────────────────────────────────────
  const type_offre = fd.get("type_offre") as string
  const categorie = fd.get("categorie") as string
  const prix_raw = fd.get("prix") as string
  const contact_nom = (fd.get("contact_nom") as string | null)?.trim()
  const contact_phone = (fd.get("contact_phone") as string | null)?.trim()

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
  const TYPE_LABEL: Record<string, string> = { location: "à louer", vente: "à vendre", residence_meublee: "meublé à louer" }
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
    statut: "en_attente_validation",
    source: "proprietaire",
  }

  let { data: prop, error: propErr } = await admin
    .from("properties").insert(insertPayload as never).select("id").single()

  // 42703 = colonne récente absente (migrations 020/023 non appliquées) → réessai sans.
  if (propErr?.code === "42703") {
    const { tarif_periode: _tp, forfaits: _f, ...base } = insertPayload
    // On reverse les forfaits dans la description en repli, pour ne rien perdre.
    if (forfaits) base.description = [base.description, `Forfaits spéciaux : ${forfaits}`].filter(Boolean).join("\n\n")
    const retry = await admin.from("properties").insert(base as never).select("id").single()
    prop = retry.data; propErr = retry.error
  }

  if (propErr || !prop) {
    console.error("INAYA-STORE-030", propErr)
    return { ok: false, error: "Erreur lors de l'enregistrement. Réessayez." }
  }

  const propertyId = (prop as { id: string }).id

  // ── Enregistrement du publieur ─────────────────────────────────────────────
  await admin.from("property_publishers").insert({
    property_id: propertyId,
    contact_nom,
    contact_phone,
    canal: "web" as never,
    source: "proprietaire" as never,
    publie_le: new Date().toISOString(),
  } as never)

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
