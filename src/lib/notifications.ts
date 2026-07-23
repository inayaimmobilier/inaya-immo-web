// ============================================================================
// Notifications internes (§6.10) — création des notifications destinées au
// staff/agents lors d'événements (nouveau lead, nouveau bien, match…).
// L'ENVOI effectif (WhatsApp / Telegram / Push app Pi / email) est réalisé par
// un service dispatcher qui consomme les lignes `envoye = false`. Ici on ne
// fait que CRÉER les notifications (insertion via service_role).
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import type { NotifCanal } from "@/types/database"
import { sendSms } from "@/lib/sms"
import { absoluteUrl } from "@/lib/site"
import { sendExpoPushToUser } from "@/lib/push"

const VALID_CANAUX: NotifCanal[] = ["push", "email", "whatsapp", "telegram"]
const DEFAULT_CANAUX: NotifCanal[] = ["push", "whatsapp", "telegram"]

/**
 * Titre d'annonce PLAFONNÉ pour les messages WhatsApp. Les titres ingérés des
 * groupes peuvent être démesurés (toute l'annonce en guise de titre) : injectés
 * dans un message, ils dépassent le seuil d'affichage de WhatsApp (~700-800
 * caractères) et le client ne voit qu'un extrait derrière « Voir plus ».
 */
export function clampTitre(titre: string | null | undefined, max = 90): string {
  const t = (titre ?? "").trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

interface NotifPayload {
  type: string                 // 'nouveau_lead', 'nouveau_bien', 'match_offre'…
  titre: string
  contenu: string
  payload?: Record<string, unknown>
}

/** Lit les canaux de notification configurés dans app_settings. */
async function getConfiguredCanaux(db: ReturnType<typeof createAdminClient>): Promise<NotifCanal[]> {
  const { data } = await db.from("app_settings").select("value").eq("key", "notif_canaux").single()
  const raw = (data as { value: unknown } | null)?.value
  if (Array.isArray(raw)) {
    const canaux = raw.filter((c): c is NotifCanal => VALID_CANAUX.includes(c as NotifCanal))
    if (canaux.length) return canaux
  }
  return DEFAULT_CANAUX
}

/** Destinataires staff : admins + (optionnellement) agents. */
async function getStaffRecipients(
  db: ReturnType<typeof createAdminClient>,
  opts: { includeAgents: boolean; agentId?: string | null },
): Promise<string[]> {
  // Si un agent est explicitement assigné, on le cible lui + les admins.
  const roles = opts.includeAgents
    ? ["super_admin", "admin", "moderateur", "agent"]
    : ["super_admin", "admin"]
  const { data } = await db
    .from("profiles").select("id").in("role", roles).eq("status", "actif")
  const ids = (data ?? []).map(p => (p as { id: string }).id)
  if (opts.agentId && !ids.includes(opts.agentId)) ids.push(opts.agentId)
  return ids
}

/**
 * Crée une notification pour chaque destinataire et chaque canal configuré.
 * Renvoie le nombre de lignes créées.
 */
export async function notifyStaff(
  notif: NotifPayload,
  opts: { includeAgents?: boolean; agentId?: string | null } = {},
): Promise<number> {
  const db = createAdminClient()
  const [canaux, recipients] = await Promise.all([
    getConfiguredCanaux(db),
    getStaffRecipients(db, { includeAgents: opts.includeAgents ?? false, agentId: opts.agentId }),
  ])
  if (recipients.length === 0) return 0

  const rows = recipients.flatMap(user_id =>
    canaux.map(canal => ({
      user_id,
      canal,
      type: notif.type,
      titre: notif.titre,
      contenu: notif.contenu,
      payload: notif.payload ?? {},
      lu: false,
      envoye: false,
    })),
  )

  const { error, count } = await db.from("notifications").insert(rows as never, { count: "exact" })
  if (error) {
    console.error("INAYA-NOTIF-001", error)
    return 0
  }
  return count ?? rows.length
}

/**
 * Notifie un utilisateur précis (propriétaire, locataire, prestataire,
 * apporteur…) : notification push in-app + WhatsApp sur le numéro de son profil.
 * Best-effort : n'échoue jamais l'action appelante.
 */
export async function notifyUser(
  userId: string | null | undefined,
  notif: NotifPayload,
  opts: { whatsapp?: boolean } = { whatsapp: true },
): Promise<void> {
  if (!userId) return
  const db = createAdminClient()
  const base = { type: notif.type, titre: notif.titre, contenu: notif.contenu, payload: notif.payload ?? {}, lu: false, envoye: false }
  const rows: Record<string, unknown>[] = [{ ...base, user_id: userId, canal: "push" as NotifCanal }]
  if (opts.whatsapp !== false) {
    const { data } = await db.from("profiles").select("telephone").eq("id", userId).single()
    const tel = (data as { telephone: string | null } | null)?.telephone?.trim()
    if (tel) rows.push({ ...base, user_id: userId, contact_telephone: tel, canal: "whatsapp" as NotifCanal })
  }
  const { error } = await db.from("notifications").insert(rows as never)
  if (error) console.error("INAYA-NOTIF-005", error.message)
}

// Anti-ban / anti-spam des alertes de match : un numéro ne reçoit qu'UNE alerte
// WhatsApp « Nouveau bien pour vous » par fenêtre, et JAMAIS deux fois le même bien.
// Sans ce plafond, une salve d'ingestion (N biens × M demandes) crée des milliers de
// messages « à froid » — et le même numéro en reçoit plusieurs d'affilée (motif qui
// fait bannir le numéro WhatsApp). Les notifications PUSH in-app ne sont PAS bornées.
const MATCH_ALERT_COOLDOWN_H = 6

/**
 * Une alerte match_offre WhatsApp est-elle autorisée pour ce destinataire ?
 * NON si : (a) il a déjà reçu/en file une alerte de match récente (cooldown), ou
 * (b) une alerte pour CE bien précis existe déjà. On compte AUSSI les notifications
 * en attente (envoye=false) pour dédupliquer une même salve avant tout envoi.
 */
async function waMatchAlertAllowed(
  db: ReturnType<typeof createAdminClient>,
  key: { waNumber?: string | null; userId?: string | null; propertyId: string },
): Promise<boolean> {
  if (!key.waNumber && !key.userId) return true
  const base = () => {
    let q = db.from("notifications").select("id", { count: "exact", head: true })
      .eq("canal", "whatsapp").eq("type", "match_offre")
    q = key.waNumber ? q.eq("contact_telephone", key.waNumber) : q.eq("user_id", key.userId!)
    return q
  }
  const cutoff = new Date(Date.now() - MATCH_ALERT_COOLDOWN_H * 3_600_000).toISOString()
  const { count: recent } = await base().gte("created_at", cutoff)
  if ((recent ?? 0) > 0) return false
  const { count: dup } = await base().filter("payload->>property_id", "eq", key.propertyId)
  if ((dup ?? 0) > 0) return false
  return true
}

/**
 * Alerte un chercheur qu'un bien correspond à sa requête (§6.9).
 * Connecté → notification push (in-app). Anonyme (WhatsApp) → canal whatsapp
 * sur son numéro. L'identité/contact du propriétaire n'est jamais inclus.
 *
 * Anti-ban : le canal WhatsApp est PLAFONNÉ par contact (voir waMatchAlertAllowed) ;
 * la notification push in-app, elle, reste systématique pour les comptes connectés.
 */
export async function notifySearcher(args: {
  userId: string | null
  contactTel: string | null
  propertyTitre: string
  quartier?: string | null
  propertyId: string
  requestId: string
  type: "exacte" | "similaire"
}): Promise<void> {
  const db = createAdminClient()
  const lieu = args.quartier ? ` à ${args.quartier}` : ""
  const titreCourt = clampTitre(args.propertyTitre)
  const intro = args.type === "exacte" ? "Un bien correspond à votre recherche" : "Un bien similaire à votre recherche est disponible"
  const url = absoluteUrl(`/biens/${args.propertyId}`)

  // Jeton d'arrêt PROPRE À CETTE recherche : le numéro court « 820 » si la colonne
  // `reference` existe (migration 041), sinon l'UUID de la requête — qui fonctionne
  // SANS migration et garantit qu'on arrête bien CETTE recherche (jamais une autre).
  // Fini le « R77 pour tout le monde » : chaque alerte a son propre lien d'arrêt.
  const { data: reqRow } = await db.from("search_requests").select("reference").eq("id", args.requestId).maybeSingle()
  const reqRef = (reqRow as { reference: number | null } | null)?.reference ?? null
  const stopToken = reqRef != null ? String(reqRef) : args.requestId
  const stopUrl = absoluteUrl(`/a/stop/${stopToken}`)

  // Le lien du bien ET le lien d'arrêt sont DANS le texte (auto-cliquables par
  // WhatsApp). On n'utilise plus de boutons URL dynamiques de template : mal
  // configurés côté Meta, ils cassaient les liens (/biens/{}) et figeaient l'arrêt.
  const contenu = [
    `${intro} : « ${titreCourt} »${lieu}.`,
    `👉 Voir l'annonce : ${url}`,
    `🔕 Ne plus recevoir d'alertes pour CETTE recherche : ${stopUrl}`,
  ].join("\n")

  const base = {
    type: "match_offre",
    titre: "Nouveau bien pour vous",
    contenu,
    // property_desc = variable {{1}} du template WhatsApp `inaya_alerte` (corps à
    // variables séparées) ; request_ref alimente le bouton « Arrêter » (/a/stop/{ref}).
    // stop_token = jeton d'arrêt PAR-REQUÊTE (référence ou UUID) : alimente le
    // postback du bouton « Arrêter les alertes » du template Gupshup, et le lien
    // texte (repli Baileys). property_desc = variable {{1}} du corps du template.
    payload: { property_id: args.propertyId, request_id: args.requestId, request_ref: reqRef, stop_token: stopToken, stop_url: stopUrl, url, match_type: args.type, property_desc: `${titreCourt}${lieu}` },
    lu: false,
    envoye: false,
  }

  const rows: Record<string, unknown>[] = []

  if (args.userId) {
    // Connecté : notification push in-app (TOUJOURS — jamais bornée)…
    rows.push({ ...base, user_id: args.userId, canal: "push" as NotifCanal })
    // …+ WhatsApp sur le numéro de son profil, SEULEMENT si le plafond anti-ban
    // l'autorise (≤ 1 alerte / COOLDOWN, jamais 2× le même bien).
    const { data: prof } = await db
      .from("profiles").select("telephone").eq("id", args.userId).single()
    const tel = (prof as { telephone: string | null } | null)?.telephone?.trim()
    if (tel && await waMatchAlertAllowed(db, { waNumber: tel, userId: args.userId, propertyId: args.propertyId })) {
      rows.push({ ...base, user_id: args.userId, contact_telephone: tel, canal: "whatsapp" as NotifCanal })
    }
  } else if (args.contactTel) {
    // Anonyme : WhatsApp sur le numéro fourni, sous plafond anti-ban.
    if (await waMatchAlertAllowed(db, { waNumber: args.contactTel, propertyId: args.propertyId })) {
      rows.push({ ...base, contact_telephone: args.contactTel, canal: "whatsapp" as NotifCanal })
    }
  }

  // Alerte AUSSI le staff qui a créé la recherche au nom du client (created_by) :
  // il suit ses clients. Requête isolée + best-effort (colonne absente = migration
  // 042 non appliquée → 42703 → data null → on ignore simplement).
  const { data: creatorRow } = await db.from("search_requests").select("created_by").eq("id", args.requestId).maybeSingle()
  const creatorId = (creatorRow as { created_by: string | null } | null)?.created_by ?? null
  if (creatorId && creatorId !== args.userId) {
    const { data: creatorProf } = await db.from("profiles").select("telephone").eq("id", creatorId).single()
    const cTel = (creatorProf as { telephone: string | null } | null)?.telephone?.trim()
    const creatorBase = {
      ...base,
      titre: "Bien trouvé pour votre client",
      contenu: `Un bien correspond à la recherche que vous suivez pour ${args.contactTel ?? "un client"} : « ${titreCourt} »${lieu}.\n👉 ${url}`,
    }
    rows.push({ ...creatorBase, user_id: creatorId, canal: "push" as NotifCanal })
    if (cTel && await waMatchAlertAllowed(db, { waNumber: cTel, userId: creatorId, propertyId: args.propertyId })) {
      rows.push({ ...creatorBase, user_id: creatorId, contact_telephone: cTel, canal: "whatsapp" as NotifCanal })
    }
  }

  if (rows.length === 0) return
  const { error } = await db.from("notifications").insert(rows as never)
  if (error) console.error("INAYA-NOTIF-003", error.message)

  // Livraison PUSH vers l'app mobile (best-effort, hors file WhatsApp) : le
  // chercheur connecté et, le cas échéant, l'agent qui suit la recherche
  // reçoivent une notification sur leurs appareils enregistrés (device_tokens).
  const pushData = { url, property_id: args.propertyId, request_id: args.requestId, type: "match_offre" }
  const pushTargets: Promise<unknown>[] = []
  if (args.userId) {
    pushTargets.push(sendExpoPushToUser(args.userId, {
      title: "Nouveau bien pour vous",
      body: `${intro} : « ${titreCourt} »${lieu}.`,
      data: pushData,
    }))
  }
  if (creatorId && creatorId !== args.userId) {
    pushTargets.push(sendExpoPushToUser(creatorId, {
      title: "Bien trouvé pour votre client",
      body: `Un bien correspond à une recherche que vous suivez : « ${titreCourt} »${lieu}.`,
      data: pushData,
    }))
  }
  await Promise.allSettled(pushTargets)
}

// ---------------------------------------------------------------------------
// Notifications liées à une demande de visite (WhatsApp vers un numéro précis).
// ---------------------------------------------------------------------------

/** Envoie une notification WhatsApp à un numéro de téléphone donné. */
async function notifyPhone(args: {
  telephone: string | null | undefined
  type: string
  titre: string
  contenu: string
  payload?: Record<string, unknown>
}): Promise<void> {
  const tel = args.telephone?.trim()
  if (!tel) return
  const db = createAdminClient()
  const { error } = await db.from("notifications").insert({
    contact_telephone: tel,
    canal: "whatsapp" as NotifCanal,
    type: args.type,
    titre: args.titre,
    contenu: args.contenu,
    payload: args.payload ?? {},
    lu: false,
    envoye: false,
  } as never)
  if (error) console.error("INAYA-NOTIF-020", error.message)
}

/** Confirmation envoyée au CLIENT dès la réception de sa demande de visite/réservation. */
export async function notifyClientVisiteRecue(args: {
  contactTel: string | null; contactNom: string; propertyTitre: string; quartier?: string | null
  reservation?: boolean
}): Promise<void> {
  const lieu = args.quartier ? ` (${args.quartier})` : ""
  const titreCourt = clampTitre(args.propertyTitre)
  const contenu = args.reservation
    ? `Bonjour ${args.contactNom}, votre demande de réservation pour « ${titreCourt} »${lieu} a bien été reçue. Nous confirmons la disponibilité avec le propriétaire très bientôt. Merci de votre confiance.`
    : `Bonjour ${args.contactNom}, votre demande de visite pour « ${titreCourt} »${lieu} a bien été reçue. Nous confirmons votre rendez-vous très bientôt. Merci de votre confiance.`

  // WhatsApp (via dispatcher whatsapp-service)
  await notifyPhone({
    telephone: args.contactTel,
    type: args.reservation ? "reservation_recue" : "visite_recue",
    titre: args.reservation ? "Inaya Immo — réservation reçue" : "Inaya Immo — demande reçue",
    contenu,
  })

  // SMS (envoi direct via Africa's Talking — indépendant du dispatcher WA)
  const smsText = args.reservation
    ? `Inaya Immo : Bonjour ${args.contactNom}, votre réservation pour « ${titreCourt} »${lieu} est bien reçue. Nous revenons vers vous très bientôt.`
    : `Inaya Immo : Bonjour ${args.contactNom}, votre demande de visite pour « ${titreCourt} »${lieu} est bien reçue. Nous confirmons votre RDV très bientôt.`
  await sendSms(args.contactTel, smsText)
}

/** Notification au PROPRIÉTAIRE/PUBLIEUR avec le lien de validation du rendez-vous / de la réservation. */
export async function notifyProprietaireVisite(args: {
  ownerTel: string | null; propertyTitre: string; quartier?: string | null
  creneau?: string | null; validationUrl: string; reservation?: boolean
}): Promise<void> {
  const lieu = args.quartier ? ` (${args.quartier})` : ""
  const titreCourt = clampTitre(args.propertyTitre)
  const contenu = args.reservation
    ? `Une demande de réservation a été reçue pour votre résidence « ${titreCourt} »${lieu}.${args.creneau ? ` Dates souhaitées : ${args.creneau}.` : ""} Confirmez ou refusez cette réservation : ${args.validationUrl}`
    : `Une demande de visite a été reçue pour votre bien « ${titreCourt} »${lieu}.${args.creneau ? ` Créneau souhaité : ${args.creneau}.` : ""} Validez ou refusez ce rendez-vous : ${args.validationUrl}`
  await notifyPhone({
    telephone: args.ownerTel,
    type: args.reservation ? "reservation_a_valider" : "visite_a_valider",
    titre: args.reservation ? "Inaya Immo — réservation à valider" : "Inaya Immo — rendez-vous à valider",
    contenu,
  })
}

/** Information au CLIENT de la décision du propriétaire (confirmé / refusé). */
export async function notifyClientDecision(args: {
  contactTel: string | null; propertyTitre: string; confirme: boolean
}): Promise<void> {
  const titreCourt = clampTitre(args.propertyTitre)
  const contenu = args.confirme
    ? `Bonne nouvelle ! Votre visite de « ${titreCourt} » est confirmée par le propriétaire. Un conseiller Inaya vous recontacte pour finaliser le créneau.`
    : `Concernant « ${titreCourt} » : le créneau proposé n'a pas pu être retenu. Un conseiller Inaya vous recontacte pour convenir d'un autre rendez-vous.`
  await notifyPhone({
    telephone: args.contactTel,
    type: args.confirme ? "visite_confirmee" : "visite_refusee",
    titre: "Inaya Immo — votre rendez-vous",
    contenu,
  })
}

// ---------------------------------------------------------------------------
// Helpers communs
// ---------------------------------------------------------------------------

/** Référence courte (4 hex majuscules) dérivée de l'UUID du lead. */
function makeRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase()
}

/** Code alphanumérique unique (5 chars) sans caractères ambigus. */
function generateConfirmCode(): string {
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let c = ""
  for (let i = 0; i < 5; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)]
  return c
}

// ---------------------------------------------------------------------------
// Helpers de formatage pour les messages WhatsApp agents
// ---------------------------------------------------------------------------

function formatPrix(prix: number, typeOffre: string): string {
  const montant = prix.toLocaleString("fr-FR")
  return typeOffre === "location" ? `${montant} FCFA/mois` : `${montant} FCFA`
}

function formatSurface(surface: number | null, nbPieces: number | null): string {
  const parts: string[] = []
  if (surface) parts.push(`${surface} m²`)
  if (nbPieces) parts.push(`${nbPieces} pièce${nbPieces > 1 ? "s" : ""}`)
  return parts.join(" · ") || ""
}

function formatTypeOffre(t: string): string {
  return t === "location" ? "À louer" : t === "vente" ? "À vendre" : t
}

/**
 * Notifie un AGENT qu'une tâche (lead) lui a été assignée.
 * Fetche toutes les données nécessaires (lead + bien + publieur + agent) pour
 * composer un message WhatsApp complet avec tous les détails de la mise en relation.
 */
export async function notifyAgentAssignment(args: {
  agentId: string
  leadId: string
  propertyId: string
  /** Fallbacks si la requête DB échoue */
  propertyTitre?: string
  contactNom?: string
}): Promise<void> {
  const db = createAdminClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  // Fetch toutes les données en parallèle
  const [agentRes, leadRes, pubRes] = await Promise.all([
    db.from("profiles").select("telephone, nom, prenom").eq("id", args.agentId).single(),
    db.from("leads")
      .select("contact_nom, contact_telephone, contact_email, message, creneaux, canal, properties(titre, type_offre, prix, surface, nb_pieces, quartier, ville)")
      .eq("id", args.leadId)
      .single(),
    db.from("property_publishers")
      .select("contact_nom, contact_phone")
      .eq("property_id", args.propertyId)
      .eq("est_original", true)
      .limit(1)
      .maybeSingle(),
  ])

  // Agent
  const agent = agentRes.data as { telephone: string | null; nom: string | null; prenom: string | null } | null
  const tel = agent?.telephone ?? null
  const agentNom = [agent?.prenom, agent?.nom].filter(Boolean).join(" ") || "l'agent"

  // Lead + bien
  type LeadRow = {
    contact_nom: string | null; contact_telephone: string | null; contact_email: string | null
    message: string | null; creneaux: { souhaite?: string }[] | null; canal: string
    properties: { titre: string; type_offre: string; prix: number; surface: number | null; nb_pieces: number | null; quartier: string | null; ville: string } | null
  }
  const lead = leadRes.data as LeadRow | null
  const prop = Array.isArray(lead?.properties) ? lead?.properties[0] : lead?.properties

  // Publieur original
  type PubRow = { contact_nom: string | null; contact_phone: string | null }
  const pub = pubRes.data as PubRow | null

  // Fallbacks si DB fail. Titre plafonné : un titre ingéré démesuré ferait
  // tronquer le message WhatsApp de l'agent derrière « Voir plus ».
  const clientNom = lead?.contact_nom || args.contactNom || "Client inconnu"
  const propTitre = clampTitre(prop?.titre || args.propertyTitre || "Bien immobilier")
  const creneau = lead?.creneaux?.[0]?.souhaite ?? null

  // ── Composition du message WhatsApp ─────────────────────────────────────
  const lines: string[] = []
  lines.push(`*Nouvelle tâche assignée — Inaya Immo*`)
  lines.push("")

  // Bien
  lines.push(`*🏠 Bien*`)
  lines.push(`${propTitre}`)
  if (prop) {
    lines.push(`${formatTypeOffre(prop.type_offre)} · *${formatPrix(prop.prix, prop.type_offre)}*`)
    const surf = formatSurface(prop.surface, prop.nb_pieces)
    if (surf) lines.push(surf)
    const lieu = [prop.quartier, prop.ville].filter(Boolean).join(", ")
    if (lieu) lines.push(`📍 ${lieu}`)
  }
  lines.push("")

  // Client
  lines.push(`*👤 Client*`)
  lines.push(clientNom)
  if (lead?.contact_telephone) lines.push(`📞 ${lead.contact_telephone}`)
  if (lead?.contact_email) lines.push(`✉ ${lead.contact_email}`)
  if (lead?.message) lines.push(`💬 _"${lead.message}"_`)
  if (creneau) lines.push(`🗓 Créneau souhaité : *${creneau}*`)
  lines.push("")

  // Publieur / propriétaire — NE JAMAIS envoyer le téléphone à l'agent
  // (réservé aux administrateurs, protection de la commission Inaya). On donne
  // seulement le nom ; la coordination avec le propriétaire passe par l'admin.
  if (pub?.contact_nom) {
    lines.push(`*🤝 Propriétaire / Publieur*`)
    lines.push(pub.contact_nom)
    lines.push(`_Coordonnées gérées par l'administration Inaya._`)
    lines.push("")
  }

  // Lien admin
  if (baseUrl) lines.push(`🔗 ${baseUrl}/admin/leads/${args.leadId}`)

  // Code unique de confirmation
  const confirmCode = generateConfirmCode()
  lines.push("")
  lines.push(`🔑 *Code de confirmation : ${confirmCode}*`)
  lines.push(`Envoyez ce code par WhatsApp pour confirmer la prise en charge.`)

  const contenu = lines.join("\n")
  const contenuCourt = `Nouvelle tâche : ${clientNom} pour « ${propTitre} »${creneau ? ` · créneau : ${creneau}` : ""}`
  // Référence courte de la tâche : identifie /t/{ref}, /tc/{ref} (confirmer) et
  // /tr/{ref} (transférer). Déterministe depuis l'id du lead — la même que celle
  // du lead_followups créé plus bas.
  const ref = makeRef(args.leadId)
  // Contexte COURT = variable {{1}} du template WhatsApp `inaya_tache`. Un template
  // n'accepte pas un pavé de 600+ caractères : les détails complets restent sur la
  // page ouverte par les boutons.
  const tacheContexte = [
    `${propTitre}${prop?.quartier ? ` · ${prop.quartier}` : ""}`,
    `Client : ${clientNom}`,
    creneau ? `Créneau : ${creneau}` : "",
  ].filter(Boolean).join(" — ")
  const payload = { lead_id: args.leadId, property_id: args.propertyId }

  const rows: Record<string, unknown>[] = [
    // 1. Push in-app (message court pour la notification)
    {
      user_id: args.agentId, canal: "push" as NotifCanal, type: "tache_assignee",
      titre: "Tâche assignée", contenu: contenuCourt, payload, lu: false, envoye: false,
    },
    // 2. WhatsApp — template `inaya_tache` (boutons Confirmer / Transférer) : le
    //    dispatcher utilise payload.ref + payload.tache_contexte. `contenu` (message
    //    complet) sert de repli quand l'envoi ne passe pas par un template.
    {
      user_id: args.agentId, contact_telephone: tel,
      canal: "whatsapp" as NotifCanal, type: "tache_assignee",
      titre: "Inaya Immo — tâche assignée", contenu,
      payload: { lead_id: args.leadId, ref, tache_contexte: tacheContexte }, lu: false, envoye: false,
    },
    // 3. Telegram groupe staff interne
    {
      canal: "telegram" as NotifCanal, type: "tache_assignee",
      titre: `Tâche assignée → ${agentNom}`,
      contenu: contenuCourt, payload, lu: false, envoye: false,
    },
  ]

  const { error } = await db.from("notifications").insert(rows as never)
  if (error) { console.error("INAYA-NOTIF-030", error.message); return }

  // Crée une ligne de suivi avec le code de confirmation
  const { error: fErr } = await db.from("lead_followups").insert({
    lead_id: args.leadId,
    agent_id: args.agentId,
    ref,
    statut_avant: "nouveau",
    awaiting_confirmation: true,
    confirmation_code: confirmCode,
  } as never)
  if (fErr && fErr.code !== "42703" && fErr.code !== "42P01") {
    console.error("INAYA-NOTIF-031", fErr.message)
  }

  // Met à jour derniere_relance_le pour que le scheduler ne re-relance pas immédiatement
  await db.from("leads")
    .update({ derniere_relance_le: new Date().toISOString() } as never)
    .eq("id", args.leadId)
}

/** Notification dédiée : nouveau lead reçu sur une annonce. */
export async function notifyNewLead(args: {
  propertyTitre: string
  quartier?: string | null
  contactNom: string
  contactTel: string
  creneau?: string | null
  leadId: string
  propertyId: string
  agentId?: string | null
}): Promise<number> {
  const lieu = args.quartier ? ` (${args.quartier})` : ""
  const creneau = args.creneau ? ` · créneau souhaité : ${args.creneau}` : ""
  return notifyStaff({
    type: "nouveau_lead",
    titre: "Nouvelle demande de visite",
    contenu: `${args.contactNom} (${args.contactTel}) souhaite visiter « ${clampTitre(args.propertyTitre)} »${lieu}${creneau}.`,
    payload: { lead_id: args.leadId, property_id: args.propertyId },
  }, { includeAgents: true, agentId: args.agentId })
}
