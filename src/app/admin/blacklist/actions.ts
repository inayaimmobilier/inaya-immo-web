"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { canonicalPhone, canonicalEmail } from "@/lib/blacklist"
import { phoneMatchCandidates } from "@/lib/phone"

type Res = { ok: true } | { ok: false; error: string }

/** Profil de l'appelant (réservé admin/super_admin). */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") return null
  return { id: user.id, role }
}

/**
 * Ajoute (ou réactive) une entrée en liste noire. Si le type est « telephone »,
 * les comptes existants correspondants sont AUSSI bannis (status='banni') et
 * rattachés à l'entrée.
 */
export async function addBlacklist(input: {
  type: "telephone" | "email"; valeur: string; motif?: string; notes?: string
}): Promise<Res> {
  const me = await requireAdmin()
  if (!me) return { ok: false, error: "Action réservée aux administrateurs." }

  const type = input.type
  if (type !== "telephone" && type !== "email") return { ok: false, error: "Type invalide." }
  const valeur = (input.valeur || "").trim()
  const valeur_norm = type === "telephone" ? canonicalPhone(valeur) : canonicalEmail(valeur)

  if (type === "telephone" && valeur_norm.replace(/\D/g, "").length < 6) return { ok: false, error: "Numéro invalide." }
  if (type === "email" && !valeur_norm.includes("@")) return { ok: false, error: "E-mail invalide." }

  const admin = createAdminClient()
  const { error } = await admin.from("blacklist").upsert(
    {
      type, valeur, valeur_norm,
      motif: input.motif?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: me.id, actif: true, updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "type,valeur_norm" },
  )
  if (error) { console.error("INAYA-BL-ADD", error.message); return { ok: false, error: "Enregistrement impossible." } }

  // Bannit + rattache les comptes existants portant ce numéro.
  if (type === "telephone") {
    const { data: profs } = await admin.from("profiles").select("id").in("telephone", phoneMatchCandidates(valeur))
    const ids = ((profs ?? []) as { id: string }[]).map(p => p.id)
    if (ids.length) {
      await admin.from("profiles").update({ status: "banni" } as never).in("id", ids)
        .then(() => {}, (e: unknown) => console.error("INAYA-BL-BAN", (e as Error).message))
      await admin.from("blacklist").update({ user_id: ids[0] } as never)
        .eq("type", "telephone").eq("valeur_norm", valeur_norm)
    }
  }

  revalidatePath("/admin/blacklist")
  return { ok: true }
}

/** Active/désactive une entrée (sans la supprimer). */
export async function toggleBlacklist(id: string, actif: boolean): Promise<Res> {
  const me = await requireAdmin()
  if (!me) return { ok: false, error: "Action réservée aux administrateurs." }
  const admin = createAdminClient()
  const { error } = await admin.from("blacklist").update({ actif, updated_at: new Date().toISOString() } as never).eq("id", id)
  if (error) { console.error("INAYA-BL-TOG", error.message); return { ok: false, error: "Échec de la mise à jour." } }
  revalidatePath("/admin/blacklist")
  return { ok: true }
}

/** Retire définitivement une entrée de la liste noire. */
export async function removeBlacklist(id: string): Promise<Res> {
  const me = await requireAdmin()
  if (!me) return { ok: false, error: "Action réservée aux administrateurs." }
  const admin = createAdminClient()
  const { error } = await admin.from("blacklist").delete().eq("id", id)
  if (error) { console.error("INAYA-BL-DEL", error.message); return { ok: false, error: "Suppression impossible." } }
  revalidatePath("/admin/blacklist")
  return { ok: true }
}
