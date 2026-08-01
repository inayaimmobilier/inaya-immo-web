// ============================================================================
// Suivi opérationnel : ce qui ATTEND, et depuis quand.
//
// Le back-office savait dire « 44 annonces en attente ». Il ne disait pas que la
// plus ancienne patientait depuis 351 heures, ni que 26 dépassaient les trois
// jours. Un compteur sans âge ne déclenche aucune action : on le regarde, on
// trouve le nombre acceptable, et l'arriéré grossit.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

const H = 3_600_000

export interface FileAttente {
  total: number
  plusAncienneHeures: number | null
  au24h: number; au48h: number; au72h: number
  echantillon: { id: string; reference: number | null; titre: string; heures: number }[]
}

/** Annonces en attente de validation, vues sous l'angle du temps d'attente. */
export async function fileModeration(): Promise<FileAttente> {
  const vide: FileAttente = { total: 0, plusAncienneHeures: null, au24h: 0, au48h: 0, au72h: 0, echantillon: [] }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("properties")
      .select("id,reference,titre,created_at")
      .eq("statut", "en_attente_validation")
      .order("created_at", { ascending: true })   // les plus anciennes d'abord
      .limit(1000)
    if (error) { console.error("INAYA-SUIVI-010", error.message); return vide }
    const rows = (data ?? []) as { id: string; reference: number | null; titre: string; created_at: string }[]
    if (rows.length === 0) return vide

    const age = (d: string) => Math.round((Date.now() - new Date(d).getTime()) / H)
    return {
      total: rows.length,
      plusAncienneHeures: age(rows[0].created_at),
      au24h: rows.filter(r => age(r.created_at) > 24).length,
      au48h: rows.filter(r => age(r.created_at) > 48).length,
      au72h: rows.filter(r => age(r.created_at) > 72).length,
      echantillon: rows.slice(0, 10).map(r => ({
        id: r.id, reference: r.reference, titre: r.titre, heures: age(r.created_at),
      })),
    }
  } catch { return vide }
}

export interface SuiviLeads {
  total: number
  sansAgent: number
  jamaisRelances: number
  ouverts: number
  parStatut: Record<string, number>
  /** Demandes ouvertes les plus anciennes sans prise en charge. */
  urgents: { id: string; nom: string | null; heures: number; statut: string }[]
}

const OUVERTS = new Set(["nouveau", "en_traitement", "contacte", "visite_planifiee", "visite_effectuee", "paiement_planifie"])

export async function suiviLeads(jours = 90): Promise<SuiviLeads> {
  const vide: SuiviLeads = { total: 0, sansAgent: 0, jamaisRelances: 0, ouverts: 0, parStatut: {}, urgents: [] }
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - jours * 24 * H).toISOString()
    const { data, error } = await admin.from("leads")
      .select("id,contact_nom,statut,agent_id,created_at,pris_en_charge_le,derniere_relance_le")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1000)
    if (error) { console.error("INAYA-SUIVI-020", error.message); return vide }
    const rows = (data ?? []) as {
      id: string; contact_nom: string | null; statut: string
      agent_id: string | null; created_at: string
      pris_en_charge_le: string | null; derniere_relance_le: string | null
    }[]

    const parStatut: Record<string, number> = {}
    for (const r of rows) parStatut[r.statut] = (parStatut[r.statut] ?? 0) + 1
    const ouverts = rows.filter(r => OUVERTS.has(r.statut))
    const age = (d: string) => Math.round((Date.now() - new Date(d).getTime()) / H)

    return {
      total: rows.length,
      sansAgent: ouverts.filter(r => !r.agent_id).length,
      jamaisRelances: ouverts.filter(r => !r.derniere_relance_le).length,
      ouverts: ouverts.length,
      parStatut,
      urgents: ouverts
        .filter(r => !r.pris_en_charge_le)
        .slice(0, 8)
        .map(r => ({ id: r.id, nom: r.contact_nom, heures: age(r.created_at), statut: r.statut })),
    }
  } catch { return vide }
}

export interface PerfAgent {
  id: string; nom: string
  assignes: number; ouverts: number; conclus: number
  /** Délai moyen de prise en charge, en heures. Null si aucune prise en charge. */
  delaiMoyenH: number | null
}

/** Charge et rythme par agent. Silencieux tant que le volume reste anecdotique. */
export async function perfAgents(jours = 90): Promise<PerfAgent[]> {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - jours * 24 * H).toISOString()
    const [{ data: leadData }, { data: profData }] = await Promise.all([
      admin.from("leads").select("agent_id,statut,created_at,pris_en_charge_le")
        .not("agent_id", "is", null).gte("created_at", since).limit(1000),
      admin.from("profiles").select("id,nom,prenom")
        .in("role", ["agent", "moderateur", "admin", "super_admin"]),
    ])
    const noms = new Map<string, string>()
    for (const p of (profData ?? []) as { id: string; nom: string | null; prenom: string | null }[]) {
      noms.set(p.id, `${p.prenom || ""} ${p.nom || ""}`.trim() || "Sans nom")
    }

    const par = new Map<string, { assignes: number; ouverts: number; conclus: number; delais: number[] }>()
    for (const l of (leadData ?? []) as { agent_id: string; statut: string; created_at: string; pris_en_charge_le: string | null }[]) {
      const e = par.get(l.agent_id) ?? { assignes: 0, ouverts: 0, conclus: 0, delais: [] }
      e.assignes++
      if (OUVERTS.has(l.statut)) e.ouverts++
      if (l.statut === "conclu") e.conclus++
      if (l.pris_en_charge_le) {
        e.delais.push((new Date(l.pris_en_charge_le).getTime() - new Date(l.created_at).getTime()) / H)
      }
      par.set(l.agent_id, e)
    }

    return [...par.entries()].map(([id, e]) => ({
      id, nom: noms.get(id) ?? "Agent inconnu",
      assignes: e.assignes, ouverts: e.ouverts, conclus: e.conclus,
      delaiMoyenH: e.delais.length ? Math.round(e.delais.reduce((s, d) => s + d, 0) / e.delais.length) : null,
    })).sort((a, b) => b.assignes - a.assignes)
  } catch { return [] }
}
