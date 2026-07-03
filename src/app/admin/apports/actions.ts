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
  if (!role || !["super_admin", "admin", "comptable"].includes(role)) return { ok: false, error: "Accès réservé au staff." }
  return { ok: true }
}

export async function createApport(f: FormData): Promise<Result> {
  const guard = await requireAdmin(); if (!guard.ok) return guard
  const apporteur_id = String(f.get("apporteur_id") || "").trim()
  if (!apporteur_id) return { ok: false, error: "Apporteur requis." }
  const montant = Number(String(f.get("montant") || "").replace(/[^\d]/g, "")) || null

  const admin = createAdminClient()
  const { error } = await admin.from("apports").insert({
    apporteur_id,
    property_id: String(f.get("property_id") || "").trim() || null,
    type: String(f.get("type") || "bien"),
    montant,
    statut: String(f.get("statut") || "en_attente"),
    notes: String(f.get("notes") || "").trim() || null,
  } as never)
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01")
      return { ok: false, error: "Module non activé : appliquez la migration 032." }
    console.error("INAYA-APPORT-001", error.message)
    return { ok: false, error: "Échec de l'enregistrement." }
  }
  revalidatePath("/admin/apports")
  return { ok: true }
}

export async function updateApportStatut(id: string, statut: string): Promise<Result> {
  const guard = await requireAdmin(); if (!guard.ok) return guard
  if (!["en_attente", "valide", "paye", "rejete"].includes(statut)) return { ok: false, error: "Statut invalide." }
  const admin = createAdminClient()
  const { error } = await admin.from("apports").update({ statut } as never).eq("id", id)
  if (error) { console.error("INAYA-APPORT-002", error.message); return { ok: false, error: "Échec." } }
  revalidatePath("/admin/apports")
  return { ok: true }
}
