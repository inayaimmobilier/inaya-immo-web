"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { lireSession } from "@/lib/facebook-session"

type Res = { ok: true } | { ok: false; error: string }

/** Réservé aux administrateurs : ces comptes ouvrent Facebook au nom d'Inaya. */
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: string } | null)?.role
  return role === "super_admin" || role === "admin"
}

const refus: Res = { ok: false, error: "Action réservée aux administrateurs." }

export async function ajouterCompte(input: { nom: string; session: string }): Promise<Res> {
  if (!await requireAdmin()) return refus
  const nom = (input.nom ?? "").trim().slice(0, 80)
  if (!nom) return { ok: false, error: "Donnez un nom au compte (ex. « Compte Inaya 1 »)." }
  const s = lireSession(input.session)
  if (!s.ok) return { ok: false, error: s.erreur }

  const admin = createAdminClient()
  // Même compte Facebook déjà enregistré : on ne le double pas (la rotation
  // compterait deux fois le même compte, et doublerait donc son usage).
  const { data: existants } = await admin.from("facebook_comptes").select("id,cookies")
  const deja = ((existants ?? []) as { id: string; cookies: string }[])
    .find(c => c.cookies.match(/(?:^|;\s*)c_user=(\d+)/)?.[1] === s.cUser)
  if (deja) return { ok: false, error: "Ce compte Facebook est déjà enregistré : utilisez « Remplacer la session »." }

  const { error } = await admin.from("facebook_comptes").insert({ nom, cookies: s.entete } as never)
  if (error) return { ok: false, error: error.code === "42P01" ? "Appliquez d'abord la migration 065 (table facebook_comptes)." : error.message }
  revalidatePath("/admin/facebook")
  return { ok: true }
}

/** Nouvelle session (après reconnexion) : le compte redevient utilisable. */
export async function remplacerSession(id: string, session: string): Promise<Res> {
  if (!await requireAdmin()) return refus
  const s = lireSession(session)
  if (!s.ok) return { ok: false, error: s.erreur }
  const { error } = await createAdminClient().from("facebook_comptes").update({
    cookies: s.entete, statut: "ok", echecs_consecutifs: 0, derniere_erreur: null, modifie_le: new Date().toISOString(),
  } as never).eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/admin/facebook")
  return { ok: true }
}

export async function basculerCompte(id: string, actif: boolean): Promise<Res> {
  if (!await requireAdmin()) return refus
  const { error } = await createAdminClient().from("facebook_comptes")
    .update({ actif, modifie_le: new Date().toISOString() } as never).eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/admin/facebook")
  return { ok: true }
}

export async function supprimerCompte(id: string): Promise<Res> {
  if (!await requireAdmin()) return refus
  const { error } = await createAdminClient().from("facebook_comptes").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/admin/facebook")
  return { ok: true }
}
