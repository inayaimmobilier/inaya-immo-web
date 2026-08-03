"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Result =
  | { ok: true; count: number; message?: string }
  | { ok: false; error: string }

/**
 * Leads qu'on REFUSE de supprimer, et pourquoi.
 *
 * Une transaction porte une commission — souvent encore due à un agent. La
 * suppression échouait déjà (contrainte de clé étrangère), mais l'écran
 * n'affichait qu'« Échec de la suppression » : impossible de comprendre, donc
 * impossible d'agir. Pire, la tentation aurait été de « réparer » en purgeant
 * les transactions, c'est-à-dire en effaçant des sommes dues.
 *
 * On lit donc la vraie raison et on la dit, en chiffres.
 */
async function leadsAvecTransaction(ids: string[]): Promise<Map<string, number>> {
  const bloques = new Map<string, number>()
  if (ids.length === 0) return bloques
  try {
    const { data } = await createAdminClient()
      .from("transactions").select("lead_id, montant_transaction").in("lead_id", ids)
    for (const t of (data ?? []) as { lead_id: string | null; montant_transaction: number | null }[]) {
      if (t.lead_id) bloques.set(t.lead_id, (bloques.get(t.lead_id) ?? 0) + (t.montant_transaction ?? 0))
    }
  } catch { /* table absente : rien ne bloque */ }
  return bloques
}

function phraseBlocage(n: number, total: number): string {
  const somme = total > 0 ? ` (${total.toLocaleString("fr-FR")} F CFA au total)` : ""
  return n === 1
    ? `1 lead conservé : il porte une transaction${somme}. Supprimez d'abord la transaction si vous voulez vraiment le retirer.`
    : `${n} leads conservés : ils portent des transactions${somme}. Supprimez d'abord ces transactions si vous voulez vraiment les retirer.`
}

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return !!role && ["super_admin", "admin"].includes(role)
}

/** Supprime les relances liées puis les leads (pas de cascade garantie). */
async function purgeLeads(ids: string[]): Promise<void> {
  const admin = createAdminClient()
  await admin.from("lead_followups").delete().in("lead_id", ids)
  await admin.from("leads").delete().in("id", ids)
}

/**
 * Suppression MULTIPLE de leads sélectionnés (réservé admin/super_admin).
 * Garde-fou : liste d'ids explicite — jamais de « supprimer tout » implicite.
 */
export async function deleteLeads(ids: string[]): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Suppression réservée aux administrateurs." }
  const clean = Array.from(new Set((ids ?? []).filter(id => typeof id === "string" && id.trim())))
  if (clean.length === 0) return { ok: false, error: "Aucun lead sélectionné." }

  const bloques = await leadsAvecTransaction(clean)
  const aSupprimer = clean.filter(id => !bloques.has(id))

  // Suppression PARTIELLE plutôt que tout ou rien : refuser l'ensemble parce
  // qu'un seul lead est lié laisserait l'utilisateur sans aucun moyen de faire
  // le ménage sur les autres.
  if (aSupprimer.length === 0) {
    const total = [...bloques.values()].reduce((a, b) => a + b, 0)
    return { ok: false, error: phraseBlocage(bloques.size, total) }
  }

  const admin = createAdminClient()
  await admin.from("lead_followups").delete().in("lead_id", aSupprimer)
  const { error } = await admin.from("leads").delete().in("id", aSupprimer)
  if (error) { console.error("INAYA-LEAD-020", error); return { ok: false, error: "Échec de la suppression." } }

  revalidatePath("/admin/leads")
  const total = [...bloques.values()].reduce((a, b) => a + b, 0)
  return {
    ok: true, count: aSupprimer.length,
    message: bloques.size > 0 ? phraseBlocage(bloques.size, total) : undefined,
  }
}

/**
 * Suppression de TOUS les leads (optionnellement filtrés par statut) — action
 * destructive et irréversible, réservée admin/super_admin.
 *
 * DOUBLE GARDE-FOU : le client doit envoyer le mot de confirmation exact
 * « SUPPRIMER » (re-vérifié ici côté serveur) — évite tout déclenchement par
 * mégarde. Renvoie le nombre de leads supprimés.
 */
export async function deleteAllLeads(opts: { statut?: string; confirm: string }): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Suppression réservée aux administrateurs." }
  if (opts?.confirm !== "SUPPRIMER") return { ok: false, error: "Confirmation invalide." }

  const admin = createAdminClient()
  // On récupère les ids concernés (filtrés par statut le cas échéant) pour purger
  // aussi leurs relances, puis on supprime.
  let q = admin.from("leads").select("id")
  if (opts.statut) q = q.eq("statut", opts.statut)
  const { data, error: selErr } = await q
  if (selErr) { console.error("INAYA-LEAD-021", selErr); return { ok: false, error: "Échec de la lecture des leads." } }
  const tous = ((data ?? []) as { id: string }[]).map(r => r.id)
  if (tous.length === 0) return { ok: true, count: 0 }

  const bloques = await leadsAvecTransaction(tous)
  const ids = tous.filter(id => !bloques.has(id))
  const total = [...bloques.values()].reduce((a, b) => a + b, 0)
  if (ids.length === 0) return { ok: false, error: phraseBlocage(bloques.size, total) }

  // Suppression par lots pour éviter les URL trop longues (in(...) volumineux).
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    await purgeLeads(ids.slice(i, i + CHUNK))
  }

  revalidatePath("/admin/leads")
  return {
    ok: true, count: ids.length,
    message: bloques.size > 0 ? phraseBlocage(bloques.size, total) : undefined,
  }
}
