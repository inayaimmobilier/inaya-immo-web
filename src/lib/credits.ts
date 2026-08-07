import { createAdminClient } from "@/lib/supabase/server"
import { calculerCout, type Tarif, type BienTarifable } from "@/lib/credits-tarif"
import { normalizePhone } from "@/lib/phone"
import { notifyUser } from "@/lib/notifications"
import { absoluteUrl } from "@/lib/site"

// ============================================================================
// CRÉDITS PROFESSIONNELS — logique serveur.
//
// Tout ce qui touche au solde passe par ici, et rien d'autre. Les écritures
// réelles sont faites par deux fonctions SQL (`crediter_compte`,
// `deverrouiller_contact`) qui verrouillent le portefeuille et tiennent le
// grand livre : c'est la base de données, et non le code applicatif, qui
// garantit qu'un solde ne bouge jamais sans trace ni deux fois pour un clic.
//
// ── QUI EST « PROFESSIONNEL » ? ────────────────────────────────────────────
//
// C'est L'EXISTENCE D'UN PORTEFEUILLE qui fait le professionnel, pas le rôle du
// compte. Un administrateur ouvre le portefeuille quand il a vérifié l'agence,
// et le suspend en cas d'abus. Adosser le droit au rôle aurait obligé à
// toucher l'énumération des rôles — donc à migrer une colonne dont dépend toute
// l'authentification — pour un gain nul.
// ============================================================================

/**
 * Les fonctions SQL de la migration 056 ne figurent pas dans les types générés
 * par Supabase (ils sont produits depuis la base, et la migration s'applique à
 * la main). On les appelle donc à travers cette signature plutôt que de
 * régénérer tout le fichier de types sur une base non migrée.
 */
type RpcLibre = (nom: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>

export interface EtatCompte {
  solde: number
  suspendu: boolean
  /** Faux tant qu'aucun administrateur n'a ouvert le portefeuille. */
  actif: boolean
}

/** Solde et état. Un compte sans portefeuille n'est pas professionnel. */
export async function etatCompte(userId: string): Promise<EtatCompte> {
  const { data } = await createAdminClient()
    .from("credit_wallets").select("solde, suspendu").eq("user_id", userId).maybeSingle()
  const w = data as { solde: number; suspendu: boolean } | null
  if (!w) return { solde: 0, suspendu: false, actif: false }
  return { solde: w.solde, suspendu: w.suspendu, actif: true }
}

/** Grille tarifaire en vigueur. */
export async function lireTarifs(): Promise<Tarif[]> {
  const { data } = await createAdminClient()
    .from("credit_tarifs").select("*").order("type_offre")
  return (data ?? []) as Tarif[]
}

// ── RÉSOLUTION DU CONTACT ──────────────────────────────────────────────────

export interface ContactBien {
  telephone: string
  nom: string | null
  /** D'où vient ce numéro — à afficher AVANT le paiement. */
  source: "proprietaire" | "diffuseur"
}

/**
 * Extrait un numéro exploitable d'un identifiant WhatsApp.
 * Le champ `sender` a la forme « 2250701020304@s.whatsapp.net ».
 *
 * Les identifiants « @lid » sont écartés : ce sont des alias opaques que
 * WhatsApp attribue dans certains groupes, sans aucun rapport avec un numéro
 * joignable. Les vendre reviendrait à vendre du vide.
 */
function numeroDepuisSender(sender: string | null): string | null {
  if (!sender) return null
  const brut = sender.split("@")[0]?.replace(/[^0-9]/g, "") ?? ""
  if (sender.includes("@lid")) return null
  // Un numéro ivoirien complet fait 13 chiffres avec l'indicatif (225 + 10).
  if (brut.length < 8 || brut.length > 15) return null
  return `+${brut}`
}

/**
 * Trouve le contact rattaché à une annonce.
 *
 * On privilégie TOUJOURS le propriétaire vérifié quand il existe : c'est ce que
 * le professionnel veut vraiment. À défaut, on rend le diffuseur — celui qui a
 * publié dans le groupe WhatsApp — en le disant.
 */
export async function contactDuBien(propertyId: string): Promise<ContactBien | null> {
  const admin = createAdminClient()

  const { data: p } = await admin.from("properties")
    .select("proprietaire_telephone, proprietaire_nom").eq("id", propertyId).maybeSingle()
  const prop = p as { proprietaire_telephone: string | null; proprietaire_nom: string | null } | null

  if (prop?.proprietaire_telephone?.trim()) {
    return {
      telephone: normalizePhone(prop.proprietaire_telephone),
      nom: prop.proprietaire_nom?.trim() || null,
      source: "proprietaire",
    }
  }

  // Message WhatsApp d'origine. Le plus RÉCENT : une annonce republiée l'est
  // souvent par quelqu'un de plus joignable que le premier diffuseur.
  const { data: m } = await admin.from("whatsapp_messages")
    .select("sender, sender_name").eq("property_id", propertyId)
    .not("sender", "is", null).order("recu_le", { ascending: false }).limit(1).maybeSingle()
  const msg = m as { sender: string | null; sender_name: string | null } | null

  const tel = numeroDepuisSender(msg?.sender ?? null)
  if (!tel) return null
  return { telephone: tel, nom: msg?.sender_name?.trim() || null, source: "diffuseur" }
}

/** Vrai si ce numéro a demandé à ne plus être transmis. */
export async function retireDeLaDiffusion(telephone: string): Promise<boolean> {
  const cle = telephone.replace(/[^0-9]/g, "")
  const { data } = await createAdminClient()
    .from("contact_opt_out").select("telephone")
  return ((data ?? []) as { telephone: string }[])
    .some(l => l.telephone.replace(/[^0-9]/g, "") === cle)
}

// ── APERÇU AVANT ACHAT ─────────────────────────────────────────────────────

export type Apercu =
  | { possible: true; cout: number; deja: boolean; source: "proprietaire" | "diffuseur"; solde: number }
  | { possible: false; raison: string; solde: number }

/**
 * Ce que le professionnel voit AVANT de payer : le prix, l'origine du contact,
 * et son solde. Rien ne se débite ici.
 */
export async function apercuDeverrouillage(userId: string, propertyId: string): Promise<Apercu> {
  const admin = createAdminClient()
  const compte = await etatCompte(userId)

  if (!compte.actif) {
    return { possible: false, raison: "Votre compte professionnel n'est pas encore activé.", solde: 0 }
  }
  if (compte.suspendu) {
    return { possible: false, raison: "Votre compte est suspendu. Contactez Inaya.", solde: compte.solde }
  }

  // Déjà acheté : on le dit, et l'interface montre le contact sans repasser à
  // la caisse.
  const { data: deja } = await admin.from("contact_unlocks")
    .select("id, contact_source").eq("user_id", userId).eq("property_id", propertyId).maybeSingle()
  if (deja) {
    const d = deja as { contact_source: "proprietaire" | "diffuseur" }
    return { possible: true, cout: 0, deja: true, source: d.contact_source, solde: compte.solde }
  }

  const { data: b } = await admin.from("properties")
    .select("type_offre, categorie, prix, statut").eq("id", propertyId).maybeSingle()
  const bien = b as (BienTarifable & { statut: string }) | null
  if (!bien) return { possible: false, raison: "Cette annonce n'existe plus.", solde: compte.solde }
  if (bien.statut !== "publie") {
    return { possible: false, raison: "Cette annonce n'est plus publiée.", solde: compte.solde }
  }

  const contact = await contactDuBien(propertyId)
  if (!contact) {
    return { possible: false, raison: "Aucun contact n'est disponible pour cette annonce.", solde: compte.solde }
  }
  if (await retireDeLaDiffusion(contact.telephone)) {
    return { possible: false, raison: "Ce contact ne peut pas être transmis.", solde: compte.solde }
  }

  const calc = calculerCout(await lireTarifs(), bien)
  if (!calc.possible) return { possible: false, raison: calc.raison, solde: compte.solde }

  return { possible: true, cout: calc.cout, deja: false, source: contact.source, solde: compte.solde }
}

// ── ACHAT ──────────────────────────────────────────────────────────────────

export type Resultat =
  | { ok: true; telephone: string; nom: string | null; source: string; cout: number; solde: number; deja: boolean }
  | { ok: false; error: string }

/**
 * Débite et rend le contact.
 *
 * Le prix est recalculé ICI, côté serveur, et jamais reçu du client : un tarif
 * transmis par l'appelant se négocierait depuis la console du navigateur.
 */
export async function deverrouillerContact(userId: string, propertyId: string): Promise<Resultat> {
  const admin = createAdminClient()

  const ap = await apercuDeverrouillage(userId, propertyId)
  if (!ap.possible) return { ok: false, error: ap.raison }

  const contact = await contactDuBien(propertyId)
  if (!contact) return { ok: false, error: "Aucun contact n'est disponible pour cette annonce." }

  if (ap.deja) {
    const { data } = await admin.from("contact_unlocks")
      .select("contact_telephone, contact_nom, contact_source, cout")
      .eq("user_id", userId).eq("property_id", propertyId).single()
    const d = data as unknown as { contact_telephone: string; contact_nom: string | null; contact_source: string; cout: number }
    return { ok: true, telephone: d.contact_telephone, nom: d.contact_nom, source: d.contact_source, cout: 0, solde: ap.solde, deja: true }
  }

  const { data: b } = await admin.from("properties")
    .select("type_offre, categorie, prix").eq("id", propertyId).single()
  const calc = calculerCout(await lireTarifs(), b as unknown as BienTarifable)
  if (!calc.possible) return { ok: false, error: calc.raison }

  const { data, error } = await (admin.rpc as unknown as RpcLibre)("deverrouiller_contact", {
    p_user_id: userId,
    p_property: propertyId,
    p_cout: calc.cout,
    p_telephone: contact.telephone,
    p_nom: contact.nom,
    p_source: contact.source,
    p_base: calc.detail,
  })

  if (error) {
    // Le solde insuffisant est un cas NORMAL, pas une panne : il mérite un
    // message compréhensible et non une erreur technique.
    if (/Solde insuffisant/i.test(error.message)) {
      return { ok: false, error: `Crédit insuffisant. Ce contact coûte ${calc.cout.toLocaleString("fr-FR")} crédits.` }
    }
    if (/suspendu/i.test(error.message)) return { ok: false, error: "Votre compte est suspendu." }
    console.error("INAYA-CREDIT-001", error)
    return { ok: false, error: "Opération impossible pour le moment." }
  }

  const r = (Array.isArray(data) ? data[0] : data) as
    { unlock_id: string; cout: number; solde: number; deja_paye: boolean }

  // Le contact part AUSSI par WhatsApp et en notification, comme demandé : le
  // professionnel doit le retrouver dans sa messagerie sans rouvrir la
  // plateforme, et il paie assez cher pour qu'un écran fermé par mégarde ne le
  // lui fasse pas perdre. L'envoi est best-effort — la ligne d'achat, elle, est
  // déjà écrite : un WhatsApp qui ne part pas ne doit pas défaire un paiement.
  void livrerContact({
    userId, propertyId, telephone: contact.telephone, nom: contact.nom, source: contact.source,
  }).catch(e => console.error("INAYA-CREDIT-003", e))

  return {
    ok: true,
    telephone: contact.telephone,
    nom: contact.nom,
    source: contact.source,
    cout: r.cout,
    solde: r.solde,
    deja: r.deja_paye,
  }
}

/** Envoie le contact acheté par WhatsApp et en notification interne. */
async function livrerContact(a: {
  userId: string; propertyId: string
  telephone: string; nom: string | null; source: "proprietaire" | "diffuseur"
}): Promise<void> {
  const { data } = await createAdminClient().from("properties")
    .select("titre, reference, quartier, ville, prix").eq("id", a.propertyId).maybeSingle()
  const b = data as { titre: string; reference: number | null; quartier: string | null; ville: string | null; prix: number | null } | null

  const lieu = [b?.quartier, b?.ville].filter(Boolean).join(", ")
  const lignes = [
    "INAYA IMMO — contact débloqué",
    "",
    b?.titre ?? "Annonce",
    lieu || null,
    b?.prix ? `${b.prix.toLocaleString("fr-FR")} FCFA` : null,
    "",
    // On RÉPÈTE l'origine du contact ici : le professionnel a vu la mention
    // avant de payer, il doit la retrouver au moment d'appeler pour savoir à
    // qui il s'adresse.
    a.source === "proprietaire" ? "Propriétaire" : "Diffuseur de l'annonce",
    `${a.nom ? a.nom + " — " : ""}${a.telephone}`,
    "",
    b?.reference ? absoluteUrl(`/b/${b.reference}`) : absoluteUrl(`/biens/${a.propertyId}`),
  ].filter(l => l !== null)

  await notifyUser(a.userId, {
    type: "contact_debloque",
    titre: "Contact débloqué",
    contenu: lignes.join("\n"),
    payload: { property_id: a.propertyId, telephone: a.telephone, source: a.source },
  })
}

// ── MOUVEMENTS ADMINISTRATIFS ──────────────────────────────────────────────

/**
 * Recharge ou correction par un administrateur.
 * Le motif est EXIGÉ : un mouvement d'argent sans justification écrite est
 * indéfendable le jour où un professionnel conteste son solde.
 */
export async function mouvementAdmin(args: {
  userId: string
  montant: number
  type: "recharge_admin" | "remboursement" | "ajustement"
  motif: string
  reference?: string | null
  auteur: string
}): Promise<{ ok: true; solde: number } | { ok: false; error: string }> {
  if (!Number.isInteger(args.montant) || args.montant === 0) {
    return { ok: false, error: "Montant invalide." }
  }
  if (!args.motif.trim()) return { ok: false, error: "Le motif est obligatoire." }

  const { data, error } = await (createAdminClient().rpc as unknown as RpcLibre)("crediter_compte", {
    p_user_id: args.userId,
    p_montant: args.montant,
    p_type: args.type,
    p_motif: args.motif.trim().slice(0, 300),
    p_reference: args.reference?.trim().slice(0, 120) || null,
    p_property: null,
    p_auteur: args.auteur,
  })

  if (error) {
    if (/Solde insuffisant/i.test(error.message)) {
      return { ok: false, error: "Le retrait dépasse le solde disponible." }
    }
    console.error("INAYA-CREDIT-002", error)
    return { ok: false, error: "Mouvement refusé." }
  }
  return { ok: true, solde: data as number }
}
