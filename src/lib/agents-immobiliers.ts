// ============================================================================
// AGENTS IMMOBILIERS EXTERNES — numéros auxquels la plateforme ne répond pas.
//
// Dans les groupes WhatsApp, beaucoup de « demandes » viennent de démarcheurs
// qui cherchent pour leurs propres clients et ne coopèrent pas : ils veulent
// le propriétaire en direct. Le DG tient une liste de leurs numéros
// (05/10/2026). Pour ces numéros :
//   - pas de réponse automatique à leurs demandes de groupe ;
//   - pas d'alerte quand un bien correspond ;
//   - leurs demandes restent enregistrées, mais À PART (onglet « Agents »).
//
// La liste vit dans `app_settings.agents_immobiliers` (aucune migration). Une
// demande est reconnue « agent » À LA LECTURE, d'après le numéro de son
// auteur : ajouter un numéro classe aussi ses demandes passées. Seules les
// demandes venues de WhatsApp sont concernées — un agent qui s'inscrit et crée
// lui-même une alerte coopère, elle continue de fonctionner.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

type Db = ReturnType<typeof createAdminClient>
const CLE = "agents_immobiliers"

export interface AgentImmobilier {
  telephone: string
  nom: string | null
  note: string | null
  ajoute_le: string
}

/** Les 8 derniers chiffres : même personne quel que soit le format du numéro. */
export const finNumero = (tel: string | null | undefined) => (tel ?? "").replace(/\D/g, "").slice(-8)

let cache: { liste: AgentImmobilier[]; expire: number } | null = null

export async function lireAgentsImmobiliers(db: Db, frais = false): Promise<AgentImmobilier[]> {
  if (!frais && cache && Date.now() < cache.expire) return cache.liste
  const { data } = await db.from("app_settings").select("value").eq("key", CLE).maybeSingle()
  const v = (data as { value?: unknown } | null)?.value
  const liste = Array.isArray(v)
    ? (v as AgentImmobilier[]).filter(a => a && typeof a.telephone === "string" && finNumero(a.telephone).length === 8)
    : []
  cache = { liste, expire: Date.now() + 60_000 }
  return liste
}

/** Ensemble des fins de numéro, pour tester une demande en une opération. */
export async function finsAgents(db: Db): Promise<Set<string>> {
  return new Set((await lireAgentsImmobiliers(db)).map(a => finNumero(a.telephone)))
}

/** Une demande est « d'agent » si elle vient de WhatsApp ET d'un numéro de la liste. */
export function demandeDAgent(r: { canal?: string | null; contact_telephone?: string | null }, fins: Set<string>): boolean {
  if (!fins.size || (r.canal ?? "whatsapp") !== "whatsapp") return false
  const f = finNumero(r.contact_telephone)
  return f.length === 8 && fins.has(f)
}

async function ecrire(db: Db, liste: AgentImmobilier[]): Promise<void> {
  const { error } = await db.from("app_settings").upsert({ key: CLE, value: liste } as never, { onConflict: "key" })
  if (error) throw new Error(error.message)
  cache = { liste, expire: Date.now() + 60_000 }
}

export async function ajouterAgentImmobilier(db: Db, a: { telephone: string; nom?: string | null; note?: string | null }): Promise<AgentImmobilier[]> {
  const fin = finNumero(a.telephone)
  if (fin.length !== 8) throw new Error("Numéro invalide : il faut au moins 8 chiffres.")
  const liste = await lireAgentsImmobiliers(db, true)
  const entree: AgentImmobilier = {
    telephone: a.telephone.replace(/[^\d+]/g, ""),
    nom: a.nom?.trim() || null, note: a.note?.trim().slice(0, 300) || null,
    ajoute_le: new Date().toISOString(),
  }
  // Déjà présent : on met à jour le nom / la note au lieu de dupliquer.
  const i = liste.findIndex(x => finNumero(x.telephone) === fin)
  const suite = i >= 0
    ? liste.map((x, k) => (k === i ? { ...x, nom: entree.nom ?? x.nom, note: entree.note ?? x.note } : x))
    : [entree, ...liste]
  await ecrire(db, suite)
  return suite
}

export async function retirerAgentImmobilier(db: Db, telephone: string): Promise<AgentImmobilier[]> {
  const fin = finNumero(telephone)
  const suite = (await lireAgentsImmobiliers(db, true)).filter(x => finNumero(x.telephone) !== fin)
  await ecrire(db, suite)
  return suite
}
