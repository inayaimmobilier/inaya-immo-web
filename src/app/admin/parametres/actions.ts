"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import { setSecret } from "@/lib/secrets"
import { PROVIDER_LIST } from "@/lib/llm"

type ActionResult = { ok: true } | { ok: false; error: string }

/** Slug de code : minuscules, sans accents, séparateurs → underscore. */
function slugCode(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

/** Enregistre la liste des types de biens gérée par l'admin (app_settings). */
export async function savePropertyTypes(
  types: { code: string; label: string; actif: boolean }[],
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role !== "super_admin" && role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  // Nettoyage + déduplication par code.
  const seen = new Set<string>()
  const clean: { code: string; label: string; actif: boolean }[] = []
  for (const t of types ?? []) {
    const code = slugCode(String(t.code || t.label || ""))
    const label = String(t.label || "").trim()
    if (!code || !label || seen.has(code)) continue
    seen.add(code)
    clean.push({ code, label, actif: t.actif !== false })
  }
  if (!clean.length) return { ok: false, error: "Ajoutez au moins un type de bien." }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "property_types", value: clean, updated_by: user.id } as never, { onConflict: "key" })
  if (error) {
    console.error("INAYA-SET-020", error)
    return { ok: false, error: "Échec de l'enregistrement des types de biens." }
  }

  revalidatePath("/", "layout")
  revalidatePath("/admin/parametres")
  return { ok: true }
}

export async function saveSettings(form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role !== "super_admin" && role !== "admin")
    return { ok: false, error: "Action réservée aux administrateurs." }

  const str = (k: string) => String(form.get(k) ?? "").trim()
  const canaux = form.getAll("notif_canaux").map(String)
  const followupStatuts = form.getAll("followup_statuts").map(String)

  const moderationPrompt = str("ia_moderation_prompt")
  const updates: { key: string; value: unknown }[] = [
    { key: "nom_plateforme", value: str("nom_plateforme") || "Inaya Immo" },
    { key: "ville_principale", value: str("ville_principale") || "Bouaké" },
    // Hero de la page d'accueil (éditable).
    { key: "hero_titre", value: str("hero_titre") || "L'immobilier en Côte d'Ivoire" },
    { key: "hero_titre_accent", value: str("hero_titre_accent") || "simplifiée" },
    { key: "hero_sous_titre", value: str("hero_sous_titre") || "Annonces vérifiées par nos agents. Location, vente, gestion de biens. Votre maison, entre de bonnes mains." },
    // Statistiques affichées sur l'accueil (vides = valeur automatique).
    { key: "stat_annonces", value: str("stat_annonces") },
    { key: "stat_quartiers", value: str("stat_quartiers") || "14" },
    { key: "stat_transactions", value: str("stat_transactions") },
    { key: "devise", value: str("devise") || "XOF" },
    { key: "delai_expiration_jours", value: Number(str("delai_expiration_jours")) || 30 },
    { key: "contact_support", value: str("contact_support") },
    { key: "meta_pixel_id", value: str("meta_pixel_id").replace(/\D/g, "") },
    { key: "commission_residence_pct", value: Number(str("commission_residence_pct")) || 10 },
    { key: "notif_canaux", value: canaux },
    { key: "followup_frequency_hours", value: Number(str("followup_frequency_hours")) || 24 },
    { key: "followup_statuts", value: followupStatuts.length > 0 ? followupStatuts : ["en_traitement", "contacte", "visite_planifiee"] },
    ...(str("assistant_model") ? [{ key: "assistant_model", value: str("assistant_model") }] : []),
    ...(moderationPrompt ? [{ key: "ia_moderation_prompt", value: moderationPrompt }] : []),
  ]

  for (const u of updates) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: u.key, value: u.value, updated_by: user.id } as never, { onConflict: "key" })
    if (error) {
      console.error("INAYA-SET-001", error)
      return { ok: false, error: "Échec de l'enregistrement des paramètres." }
    }
  }

  // Clés API des fournisseurs IA : on n'enregistre que les champs renseignés
  // (un champ vide conserve la clé existante). Stockage via service_role.
  for (const p of PROVIDER_LIST) {
    const v = String(form.get(`secret_${p.envKey}`) ?? "").trim()
    if (v) await setSecret(p.envKey, v, user.id)
  }

  revalidatePath("/admin/parametres")
  return { ok: true }
}
