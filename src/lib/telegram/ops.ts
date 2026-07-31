// ============================================================================
// Opérations d'administration exécutables depuis Telegram.
//   Les server actions du back-office s'appuient sur la session cookie : elles
//   sont inutilisables ici. Ce module refait les mêmes gestes en service_role,
//   avec le MÊME jeu de garde-fous (transactions liées, journal de suppression,
//   matching et expiration à la publication) — un raccourci ici créerait deux
//   comportements divergents entre le dashboard et Telegram.
//   L'autorisation est vérifiée en amont par le routeur (voir guard.ts).
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"
import type { TgUser } from "./guard"

export type OpResult = { ok: true; message: string } | { ok: false; error: string }

export interface PropRow {
  id: string; reference: number | null; titre: string; statut: string
  type_offre: string; categorie: string; prix: number | null
  ville: string | null; quartier: string | null; created_at: string
  nb_chambres: number | null; description: string | null
}

const COLS = "id,reference,titre,statut,type_offre,categorie,prix,ville,quartier,created_at,nb_chambres,description"

export const STATUTS = [
  "publie", "en_attente_validation", "rejete", "suspendu", "expire", "reserve", "conclu",
] as const

// ── Lecture des annonces ────────────────────────────────────────────────────

export async function listProperties(opts: {
  statut?: string; q?: string; ville?: string; page?: number; perPage?: number
}): Promise<{ rows: PropRow[]; total: number }> {
  const admin = createAdminClient()
  const perPage = opts.perPage ?? 5
  const page = Math.max(0, opts.page ?? 0)

  let query = admin.from("properties").select(COLS, { count: "exact" })
  if (opts.statut) query = query.eq("statut", opts.statut)
  if (opts.ville) query = query.ilike("ville", `%${opts.ville}%`)
  if (opts.q) {
    const q = opts.q.trim()
    // Une référence saisie seule (« 5043 ») doit tomber pile sur l'annonce.
    if (/^\d+$/.test(q)) query = query.eq("reference", Number(q))
    else query = query.or(`titre.ilike.%${q}%,description.ilike.%${q}%,quartier.ilike.%${q}%`)
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(page * perPage, page * perPage + perPage - 1)
  if (error) { console.error("INAYA-TG-OPS-010", error.message); return { rows: [], total: 0 } }
  return { rows: (data ?? []) as PropRow[], total: count ?? 0 }
}

export async function getProperty(id: string): Promise<PropRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("properties").select(COLS).eq("id", id).maybeSingle()
  return (data as PropRow | null) ?? null
}

/** Retrouve une annonce par son numéro de référence (ce que l'admin lit). */
export async function getByReference(ref: number): Promise<PropRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("properties").select(COLS).eq("reference", ref).maybeSingle()
  return (data as PropRow | null) ?? null
}

export async function firstPhoto(propertyId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("property_media")
    .select("url,type").eq("property_id", propertyId).eq("type", "image")
    .order("ordre", { ascending: true }).limit(1).maybeSingle()
  return (data as { url: string } | null)?.url ?? null
}

// ── Modération ──────────────────────────────────────────────────────────────

/**
 * Change le statut d'une annonce. À la publication on rejoue exactement ce que
 * fait le back-office : pose de l'expiration puis matching des chercheurs.
 */
export async function setStatut(id: string, statut: string): Promise<OpResult> {
  if (!(STATUTS as readonly string[]).includes(statut)) return { ok: false, error: "Statut inconnu." }
  const admin = createAdminClient()
  const { error } = await admin.from("properties").update({ statut } as never).eq("id", id)
  if (error) { console.error("INAYA-TG-OPS-020", error.message); return { ok: false, error: "Échec de la mise à jour." } }

  if (statut === "publie") {
    try {
      const { expireAtForProperty } = await import("@/lib/property-expiry")
      const eat = await expireAtForProperty(id)
      if (eat) await admin.from("properties").update({ expire_at: eat } as never).eq("id", id)
    } catch (e) { console.error("INAYA-TG-OPS-021", e) }
    try {
      const { runMatchingForProperty } = await import("@/lib/matching")
      const n = await runMatchingForProperty(id)
      if (n > 0) console.info(`INAYA-TG-MATCH ${n} chercheur(s) alerté(s) pour ${id}`)
    } catch (e) { console.error("INAYA-TG-OPS-022", e) }
  }
  return { ok: true, message: `Statut passé à « ${statut} ».` }
}

/** Suppression — mêmes garde-fous que le back-office. */
export async function removeProperty(id: string, by: TgUser): Promise<OpResult> {
  if (!by.peutSupprimer) return { ok: false, error: "Suppression réservée aux administrateurs." }
  const admin = createAdminClient()

  const { count } = await admin.from("transactions")
    .select("id", { count: "exact", head: true }).eq("property_id", id)
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Des transactions sont liées à cette annonce. Suspendez-la plutôt." }
  }

  try {
    const { logPropertyDeletions } = await import("@/lib/deletion-log")
    await logPropertyDeletions([id], { source: "admin", deletedBy: by.id })
  } catch (e) { console.error("INAYA-TG-OPS-030", e) }

  await admin.from("moderation_logs").delete().eq("property_id", id)
  await admin.from("leads").delete().eq("property_id", id)
  const { error } = await admin.from("properties").delete().eq("id", id)
  if (error) { console.error("INAYA-TG-OPS-031", error.message); return { ok: false, error: "Échec de la suppression." } }
  return { ok: true, message: "Annonce supprimée." }
}

/** Modification d'un champ simple de l'annonce (prix, titre, description…). */
export async function patchProperty(id: string, field: string, raw: string): Promise<OpResult> {
  const NUM = ["prix", "nb_chambres", "nb_pieces", "surface", "nb_sdb"]
  const TXT = ["titre", "description", "quartier", "ville"]
  if (![...NUM, ...TXT].includes(field)) return { ok: false, error: "Champ non modifiable depuis Telegram." }

  let value: string | number | null
  if (NUM.includes(field)) {
    const n = Number(raw.replace(/[^\d]/g, ""))
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Valeur numérique invalide." }
    value = n
  } else {
    value = raw.trim()
    if (!value) return { ok: false, error: "Valeur vide." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("properties").update({ [field]: value } as never).eq("id", id)
  if (error) { console.error("INAYA-TG-OPS-040", error.message); return { ok: false, error: "Échec de la modification." } }
  return { ok: true, message: `« ${field} » mis à jour.` }
}

// ── Comptes ─────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string; nom: string | null; prenom: string | null; telephone: string | null
  role: string; verifie: boolean | null; created_at: string
}

export async function listUsers(opts: { q?: string; role?: string; page?: number; perPage?: number }):
  Promise<{ rows: UserRow[]; total: number }> {
  const admin = createAdminClient()
  const perPage = opts.perPage ?? 8
  const page = Math.max(0, opts.page ?? 0)
  let query = admin.from("profiles").select("id,nom,prenom,telephone,role,verifie,created_at", { count: "exact" })
  if (opts.role) query = query.eq("role", opts.role)
  if (opts.q) query = query.or(`nom.ilike.%${opts.q}%,prenom.ilike.%${opts.q}%,telephone.ilike.%${opts.q}%`)
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(page * perPage, page * perPage + perPage - 1)
  if (error) { console.error("INAYA-TG-OPS-050", error.message); return { rows: [], total: 0 } }
  return { rows: (data ?? []) as UserRow[], total: count ?? 0 }
}

export async function getUser(id: string): Promise<UserRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("profiles")
    .select("id,nom,prenom,telephone,role,verifie,created_at").eq("id", id).maybeSingle()
  return (data as UserRow | null) ?? null
}

export async function setUserVerified(id: string, verifie: boolean, by: TgUser): Promise<OpResult> {
  if (!by.peutGererComptes) return { ok: false, error: "Action réservée aux administrateurs." }
  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ verifie } as never).eq("id", id)
  if (error) return { ok: false, error: "Échec." }
  return { ok: true, message: verifie ? "Compte validé." : "Validation retirée." }
}

export async function setUserRole(id: string, role: string, by: TgUser): Promise<OpResult> {
  if (!by.peutGererComptes) return { ok: false, error: "Action réservée aux administrateurs." }
  const ROLES = ["client", "agent", "moderateur", "admin", "proprietaire", "prestataire"]
  if (role === "super_admin" && by.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut nommer un super admin." }
  if (!ROLES.includes(role) && role !== "super_admin") return { ok: false, error: "Rôle inconnu." }
  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ role } as never).eq("id", id)
  if (error) return { ok: false, error: "Échec." }
  return { ok: true, message: `Rôle changé en « ${role} ».` }
}

/** Création d'un compte (mêmes règles que Admin → Utilisateurs). */
export async function createUser(input: {
  nom: string; email: string; password: string; role: string; telephone?: string
}, by: TgUser): Promise<OpResult> {
  if (!by.peutGererComptes) return { ok: false, error: "Action réservée aux administrateurs." }
  const nom = input.nom.trim()
  const email = input.email.trim().toLowerCase()
  const tel = (input.telephone || "").replace(/[^\d+]/g, "") || null
  if (!nom) return { ok: false, error: "Le nom est requis." }
  if (!email.includes("@")) return { ok: false, error: "E-mail invalide." }
  if ((input.password || "").length < 6) return { ok: false, error: "Mot de passe : 6 caractères minimum." }
  if (input.role === "super_admin" && by.role !== "super_admin")
    return { ok: false, error: "Seul un super admin peut créer un super admin." }

  const admin = createAdminClient()
  if (tel) {
    const { data: dup } = await admin.from("profiles").select("id").eq("telephone", tel).maybeSingle()
    if (dup) return { ok: false, error: "Un compte existe déjà avec ce numéro." }
  }
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: input.password, email_confirm: true, user_metadata: { nom, telephone: tel },
  })
  if (cErr || !created.user) {
    if (cErr?.message?.toLowerCase().includes("already")) return { ok: false, error: "Un compte existe déjà avec cet e-mail." }
    console.error("INAYA-TG-OPS-060", cErr)
    return { ok: false, error: "Échec de la création du compte." }
  }
  const { error: uErr } = await admin.from("profiles")
    .update({ role: input.role, nom, telephone: tel } as never).eq("id", created.user.id)
  if (uErr) { console.error("INAYA-TG-OPS-061", uErr); return { ok: false, error: "Compte créé, mais rôle non appliqué." } }
  return { ok: true, message: `Compte « ${nom} » créé (${input.role}).` }
}

// ── Statistiques ────────────────────────────────────────────────────────────

export interface Stats {
  publiees: number; attente: number; total: number
  nouvelles24h: number; leads24h: number; users: number
  vues24h: number; vues7j: number
  topVues: { titre: string; reference: number | null; vues: number }[]
}

export async function stats(): Promise<Stats> {
  const admin = createAdminClient()
  const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
  const head = { count: "exact" as const, head: true }
  const n = (r: { count: number | null }) => r.count ?? 0

  const [publiees, attente, total, nouvelles24h, leads24h, users] = await Promise.all([
    admin.from("properties").select("id", head).eq("statut", "publie").then(n, () => 0),
    admin.from("properties").select("id", head).eq("statut", "en_attente_validation").then(n, () => 0),
    admin.from("properties").select("id", head).then(n, () => 0),
    admin.from("properties").select("id", head).gte("created_at", iso(24)).then(n, () => 0),
    admin.from("leads").select("id", head).gte("created_at", iso(24)).then(n, () => 0),
    admin.from("profiles").select("id", head).then(n, () => 0),
  ])

  // Vues : mêmes précautions que le dashboard (PostgREST plafonne à 1000 lignes,
  // donc order desc + pagination, sinon on ne voit que les visites les plus anciennes).
  let vues24h = 0, vues7j = 0
  const parBien = new Map<string, number>()
  try {
    const since = iso(24 * 7)
    const cut = Date.now() - 24 * 3600_000
    for (let page = 0; page < 10; page++) {
      const { data, error } = await admin.from("page_views")
        .select("path,created_at").gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999)
      if (error) break
      const batch = (data ?? []) as { path: string; created_at: string }[]
      for (const v of batch) {
        vues7j++
        if (new Date(v.created_at).getTime() >= cut) vues24h++
        const m = /^\/biens\/([0-9a-f-]{36})/i.exec(v.path)
        if (m) parBien.set(m[1], (parBien.get(m[1]) ?? 0) + 1)
      }
      if (batch.length < 1000) break
    }
  } catch { /* stats best-effort */ }

  const topIds = [...parBien.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id)
  let topVues: Stats["topVues"] = []
  if (topIds.length) {
    const { data } = await admin.from("properties").select("id,titre,reference").in("id", topIds)
    topVues = ((data ?? []) as { id: string; titre: string; reference: number | null }[])
      .map(p => ({ titre: p.titre, reference: p.reference, vues: parBien.get(p.id) ?? 0 }))
      .sort((a, b) => b.vues - a.vues)
  }

  return { publiees, attente, total, nouvelles24h, leads24h, users, vues24h, vues7j, topVues }
}

// ── Recherche transverse dans les autres bases ──────────────────────────────
// L'admin et les modérateurs voient ce que le public ne voit jamais : qui a
// publié une annonce et comment le joindre. C'est le seul endroit de la
// plateforme où ce contact sort — d'où le contrôle de rôle explicite.

export interface Publieur {
  contact_nom: string | null; contact_phone: string | null
  canal: string | null; group_nom: string | null; publie_le: string | null; rang: number | null
}

/** Coordonnées des publieurs d'une annonce. Réservé admin / modérateur. */
export async function publishersOf(propertyId: string, by: TgUser): Promise<Publieur[] | null> {
  if (!["super_admin", "admin", "moderateur"].includes(by.role)) return null
  const admin = createAdminClient()
  const { data, error } = await admin.from("property_publishers")
    .select("contact_nom,contact_phone,canal,group_nom,publie_le,rang")
    .eq("property_id", propertyId).order("rang", { ascending: true })
  if (error) { console.error("INAYA-TG-OPS-070", error.message); return [] }
  return (data ?? []) as Publieur[]
}

/** Demandes reçues (visites, réservations), avec le titre de l'annonce. */
export async function recentLeads(opts: { jours?: number; statut?: string; limit?: number }) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - (opts.jours ?? 7) * 86_400_000).toISOString()
  let q = admin.from("leads")
    .select("id,property_id,contact_nom,contact_telephone,statut,message,creneaux,sejour_nuits,montant_estime,created_at")
    .gte("created_at", since)
  if (opts.statut) q = q.eq("statut", opts.statut)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 15)
  if (error) { console.error("INAYA-TG-OPS-071", error.message); return [] }
  const rows = (data ?? []) as (Record<string, unknown> & { property_id: string | null })[]

  const ids = [...new Set(rows.map(r => r.property_id).filter((v): v is string => !!v))]
  const titres = new Map<string, { titre: string; reference: number | null }>()
  if (ids.length) {
    const { data: props } = await admin.from("properties").select("id,titre,reference").in("id", ids)
    for (const p of (props ?? []) as { id: string; titre: string; reference: number | null }[]) {
      titres.set(p.id, { titre: p.titre, reference: p.reference })
    }
  }
  return rows.map(r => ({ ...r, annonce: r.property_id ? titres.get(r.property_id) ?? null : null }))
}

/** Ce que les clients recherchent (demandes enregistrées). */
export async function clientSearches(jours = 30, limit = 20) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - jours * 86_400_000).toISOString()
  const { data, error } = await admin.from("search_requests")
    .select("reference,contact_nom,contact_telephone,type_offre,categories,zones,budget_min,budget_max,nb_pieces_min,description_libre,statut,created_at")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(limit)
  if (error) { console.error("INAYA-TG-OPS-072", error.message); return [] }
  return data ?? []
}

export async function pharmaciesDeGarde() {
  const admin = createAdminClient()
  const { data } = await admin.from("pharmacies_garde")
    .select("nom,ville,quartier,adresse,telephone,date_debut,date_fin")
    .eq("actif", true).order("ville", { ascending: true }).limit(40)
  return data ?? []
}

export async function openSignalements(limit = 15) {
  const admin = createAdminClient()
  const { data, error } = await admin.from("signalements")
    .select("property_id,categorie,motif,contact,statut,created_at")
    .neq("statut", "traite").order("created_at", { ascending: false }).limit(limit)
  if (error) { console.error("INAYA-TG-OPS-073", error.message); return [] }
  return data ?? []
}

export async function recentDeletions(jours = 7, limit = 30) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - jours * 86_400_000).toISOString()
  const { data, error } = await admin.from("property_deletions")
    .select("reference,titre,type_offre,prix,ville,quartier,statut_avant,source,deleted_at")
    .gte("deleted_at", since).order("deleted_at", { ascending: false }).limit(limit)
  if (error) { console.error("INAYA-TG-OPS-074", error.message); return [] }
  return data ?? []
}

/** Chiffre d'affaires et commissions sur une période. */
export async function financeSummary(jours = 30) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - jours * 86_400_000).toISOString()
  const { data, error } = await admin.from("transactions")
    .select("montant_transaction,commission_montant_total,commission_part_inaya,commission_part_agent,statut,type_operation,created_at")
    .gte("created_at", since).limit(500)
  if (error) { console.error("INAYA-TG-OPS-075", error.message); return null }
  const rows = (data ?? []) as { montant_transaction: number | null; commission_montant_total: number | null; commission_part_inaya: number | null; statut: string | null }[]
  const sum = (f: (r: typeof rows[number]) => number | null | undefined) =>
    rows.reduce((s, r) => s + (f(r) ?? 0), 0)
  return {
    periode_jours: jours, nb_transactions: rows.length,
    volume: sum(r => r.montant_transaction),
    commissions_totales: sum(r => r.commission_montant_total),
    part_inaya: sum(r => r.commission_part_inaya),
  }
}

export async function zonesList(ville?: string) {
  const admin = createAdminClient()
  let q = admin.from("zones").select("nom,ville").eq("actif", true)
  if (ville) q = q.ilike("ville", `%${ville}%`)
  const { data } = await q.order("ville", { ascending: true }).limit(200)
  return data ?? []
}
