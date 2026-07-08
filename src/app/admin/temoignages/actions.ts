"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Result = { ok: true } | { ok: false; error: string }

async function requireModerator(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  return !!role && ["super_admin", "admin", "moderateur"].includes(role)
}

/** Publie ou rejette un témoignage. */
export async function moderateTestimonial(id: string, statut: "publie" | "rejete"): Promise<Result> {
  if (!(await requireModerator())) return { ok: false, error: "Accès réservé aux administrateurs." }
  const { error } = await createAdminClient().from("testimonials").update({ statut } as never).eq("id", id)
  if (error) { console.error("INAYA-TESTIMONIAL-010", error.message); return { ok: false, error: "Échec de la mise à jour." } }
  revalidatePath("/admin/temoignages"); revalidatePath("/temoignages"); revalidatePath("/")
  return { ok: true }
}

/** Supprime définitivement un témoignage. */
export async function deleteTestimonial(id: string): Promise<Result> {
  if (!(await requireModerator())) return { ok: false, error: "Accès réservé aux administrateurs." }
  const { error } = await createAdminClient().from("testimonials").delete().eq("id", id)
  if (error) { console.error("INAYA-TESTIMONIAL-011", error.message); return { ok: false, error: "Échec de la suppression." } }
  revalidatePath("/admin/temoignages"); revalidatePath("/temoignages"); revalidatePath("/")
  return { ok: true }
}
