"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { UserRole, CommissionMode, OperationType, PropertyCat, PropertySource } from "@/types/database"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Vérifie que l'appelant est admin / super_admin.
 * Renvoie son id ET son client authentifié : les écritures passent par ce
 * client (et non service_role) pour que la RLS s'applique et surtout pour que
 * le trigger d'historique capture `auth.uid()` = l'auteur réel de la modif.
 */
async function requireAdmin(): Promise<{ id: string; db: SupabaseClient } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const profile = data as { role: UserRole } | null
  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) return null
  return { id: user.id, db: supabase }
}

/** Parse / normalise les champs du formulaire en payload de règle. */
function parseForm(form: FormData) {
  const str = (k: string) => {
    const v = form.get(k)
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null
  }
  const num = (k: string) => {
    const v = str(k)
    return v != null ? Number(v) : null
  }
  const arr = (k: string) => {
    // champs multi : valeurs séparées par des virgules
    const v = str(k)
    if (!v) return null
    const items = v.split(",").map(s => s.trim()).filter(Boolean)
    return items.length ? items : null
  }

  return {
    nom: str("nom") ?? "",
    priorite: num("priorite") ?? 0,
    actif: form.get("actif") === "on" || form.get("actif") === "true",
    est_defaut: form.get("est_defaut") === "on" || form.get("est_defaut") === "true",
    type_operation: (str("type_operation") ?? "tous") as OperationType,
    categories: arr("categories") as PropertyCat[] | null,
    zones: arr("zones"),
    prix_min: num("prix_min"),
    prix_max: num("prix_max"),
    source: (str("source") as PropertySource | null),
    agent_id: str("agent_id"),
    contexte_tag: str("contexte_tag"),
    mode_calcul: (str("mode_calcul") ?? "pct_prix") as CommissionMode,
    valeur: num("valeur") ?? 0,
    montant_min: num("montant_min"),
    montant_max: num("montant_max"),
    split_agent_pct: num("split_agent_pct") ?? 0,
    valide_du: str("valide_du"),
    valide_au: str("valide_au"),
  }
}

function validate(p: ReturnType<typeof parseForm>): string | null {
  if (!p.nom) return "Le nom de la règle est obligatoire."
  if (Number.isNaN(p.valeur) || p.valeur < 0) return "La valeur doit être un nombre positif."
  if (["pct_prix", "pct_loyer", "combine"].includes(p.mode_calcul) && p.valeur > 100)
    return "Un pourcentage ne peut pas dépasser 100."
  if (p.split_agent_pct < 0 || p.split_agent_pct > 100)
    return "Le split agent doit être compris entre 0 et 100 %."
  if (p.prix_min != null && p.prix_max != null && p.prix_min > p.prix_max)
    return "Le prix minimum ne peut pas dépasser le prix maximum."
  return null
}

/** Crée une nouvelle règle de commission. */
export async function createRule(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const p = parseForm(form)
  const err = validate(p)
  if (err) return { ok: false, error: err }

  const db = admin.db

  // Une seule règle par défaut : si on coche est_defaut, on retire le flag des autres.
  if (p.est_defaut) {
    await db.from("commission_rules").update({ est_defaut: false } as never).eq("est_defaut", true)
  }

  const { data, error } = await db
    .from("commission_rules")
    .insert({ ...p, created_by: admin.id } as never)
    .select("id")
    .single()

  if (error) {
    console.error("INAYA-DB-020", error)
    return { ok: false, error: "Échec de la création de la règle." }
  }

  revalidatePath("/admin/commissions")
  return { ok: true, id: (data as { id: string }).id }
}

/** Met à jour une règle existante (l'historique est sauvegardé par trigger DB). */
export async function updateRule(id: string, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const p = parseForm(form)
  const err = validate(p)
  if (err) return { ok: false, error: err }

  const db = admin.db

  if (p.est_defaut) {
    await db.from("commission_rules").update({ est_defaut: false } as never)
      .eq("est_defaut", true).neq("id", id)
  }

  const { error } = await db.from("commission_rules").update(p as never).eq("id", id)
  if (error) {
    console.error("INAYA-DB-021", error)
    return { ok: false, error: "Échec de la mise à jour de la règle." }
  }

  revalidatePath("/admin/commissions")
  revalidatePath(`/admin/commissions/${id}`)
  return { ok: true, id }
}

/** Active / désactive rapidement une règle. */
export async function toggleRule(id: string, actif: boolean): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const db = admin.db

  // Empêche de désactiver l'unique règle par défaut.
  if (!actif) {
    const { data } = await db.from("commission_rules").select("est_defaut").eq("id", id).single()
    if ((data as { est_defaut: boolean } | null)?.est_defaut)
      return { ok: false, error: "Impossible de désactiver la règle par défaut." }
  }

  const { error } = await db.from("commission_rules").update({ actif } as never).eq("id", id)
  if (error) {
    console.error("INAYA-DB-022", error)
    return { ok: false, error: "Échec du changement d'état." }
  }
  revalidatePath("/admin/commissions")
  return { ok: true, id }
}

/** Supprime une règle (interdit pour la règle par défaut). */
export async function deleteRule(id: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "Action réservée aux administrateurs." }

  const db = admin.db
  const { data } = await db.from("commission_rules").select("est_defaut").eq("id", id).single()
  if ((data as { est_defaut: boolean } | null)?.est_defaut)
    return { ok: false, error: "La règle par défaut ne peut pas être supprimée." }

  const { error } = await db.from("commission_rules").delete().eq("id", id)
  if (error) {
    console.error("INAYA-DB-023", error)
    return { ok: false, error: "Échec de la suppression." }
  }
  revalidatePath("/admin/commissions")
  return { ok: true }
}

/** Server action de formulaire : crée puis redirige vers la liste. */
export async function createRuleAndRedirect(form: FormData) {
  const res = await createRule(form)
  if (!res.ok) redirect(`/admin/commissions/nouvelle?error=${encodeURIComponent(res.error)}`)
  redirect("/admin/commissions?ok=created")
}

/** Server action de formulaire : met à jour puis redirige vers la liste. */
export async function updateRuleAndRedirect(id: string, form: FormData) {
  const res = await updateRule(id, form)
  if (!res.ok) redirect(`/admin/commissions/${id}?error=${encodeURIComponent(res.error)}`)
  redirect("/admin/commissions?ok=updated")
}
