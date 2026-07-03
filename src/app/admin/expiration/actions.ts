"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Result = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) return { ok: false, error: "Accès réservé aux administrateurs." }
  return { ok: true }
}

const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return isNaN(n) || String(v ?? "").trim() === "" ? null : n }
const str = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s || null }

export async function createExpiryRule(f: FormData): Promise<Result> {
  const guard = await requireAdmin(); if (!guard.ok) return guard
  const nom = str(f.get("nom"))
  const duree = num(f.get("duree_jours"))
  if (!nom) return { ok: false, error: "Nom de la règle requis." }
  if (!duree || duree < 1) return { ok: false, error: "Durée en jours requise (≥ 1)." }

  const quartiersRaw = String(f.get("quartiers") ?? "").split(",").map(s => s.trim()).filter(Boolean)
  const meubleRaw = String(f.get("meuble") ?? "")
  const admin = createAdminClient()
  const { error } = await admin.from("expiry_rules").insert({
    nom,
    actif: true,
    priorite: num(f.get("priorite")) ?? 0,
    type_offre: str(f.get("type_offre")),
    categorie: str(f.get("categorie")),
    ville: str(f.get("ville")),
    quartiers: quartiersRaw.length ? quartiersRaw : null,
    prix_min: num(f.get("prix_min")),
    prix_max: num(f.get("prix_max")),
    meuble: meubleRaw === "oui" ? true : meubleRaw === "non" ? false : null,
    duree_jours: duree,
  } as never)
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01")
      return { ok: false, error: "Module non activé : appliquez la migration 033 dans Supabase." }
    console.error("INAYA-EXP-010", error.message)
    return { ok: false, error: "Échec de l'enregistrement." }
  }
  revalidatePath("/admin/expiration")
  return { ok: true }
}

export async function toggleExpiryRule(id: string, actif: boolean): Promise<Result> {
  const guard = await requireAdmin(); if (!guard.ok) return guard
  const admin = createAdminClient()
  const { error } = await admin.from("expiry_rules").update({ actif } as never).eq("id", id)
  if (error) { console.error("INAYA-EXP-011", error.message); return { ok: false, error: "Échec." } }
  revalidatePath("/admin/expiration")
  return { ok: true }
}

export async function deleteExpiryRule(id: string): Promise<Result> {
  const guard = await requireAdmin(); if (!guard.ok) return guard
  const admin = createAdminClient()
  const { error } = await admin.from("expiry_rules").delete().eq("id", id)
  if (error) { console.error("INAYA-EXP-012", error.message); return { ok: false, error: "Échec." } }
  revalidatePath("/admin/expiration")
  return { ok: true }
}
