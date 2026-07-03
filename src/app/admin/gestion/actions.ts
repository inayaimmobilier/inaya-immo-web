"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Result = { ok: true; id?: string } | { ok: false; error: string }

async function requireStaff(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur", "comptable"].includes(role))
    return { ok: false, error: "Accès réservé au staff." }
  return { ok: true }
}

/** Insert résilient : message clair si la table n'existe pas (migration 032). */
async function insert(table: string, row: Record<string, unknown>, path: string): Promise<Result> {
  const guard = await requireStaff()
  if (!guard.ok) return guard
  const admin = createAdminClient()
  const { data, error } = await admin.from(table).insert(row as never).select("id").single()
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01")
      return { ok: false, error: "Module gestion locative non activé : appliquez la migration 032 dans Supabase." }
    console.error("INAYA-GEST-001", error.message)
    return { ok: false, error: "Échec de l'enregistrement." }
  }
  revalidatePath(path)
  return { ok: true, id: (data as { id: string }).id }
}

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""))
  return isNaN(n) || n === 0 ? null : n
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return s || null
}

export async function createMandat(f: FormData): Promise<Result> {
  const proprietaire_id = str(f.get("proprietaire_id"))
  if (!proprietaire_id) return { ok: false, error: "Propriétaire requis." }
  return insert("mandats", {
    proprietaire_id,
    property_id: str(f.get("property_id")),
    type: str(f.get("type")) ?? "gestion_locative",
    commission_pct: num(f.get("commission_pct")),
    date_debut: str(f.get("date_debut")),
    notes: str(f.get("notes")),
    actif: true,
  }, "/admin/gestion")
}

export async function createLocataire(f: FormData): Promise<Result> {
  return insert("locataires", {
    property_id: str(f.get("property_id")),
    mandat_id: str(f.get("mandat_id")),
    proprietaire_id: str(f.get("proprietaire_id")),
    user_id: str(f.get("user_id")),        // compte locataire lié (portail locataire)
    nom: str(f.get("nom")),
    telephone: str(f.get("telephone")),
    loyer_mensuel: num(f.get("loyer_mensuel")),
    caution: num(f.get("caution")),
    date_entree: str(f.get("date_entree")),
    statut: "actif",
  }, `/admin/gestion/${str(f.get("mandat_id")) ?? ""}`)
}

export async function createEncaissement(f: FormData): Promise<Result> {
  return insert("encaissements", {
    property_id: str(f.get("property_id")),
    locataire_id: str(f.get("locataire_id")),
    mandat_id: str(f.get("mandat_id")),
    proprietaire_id: str(f.get("proprietaire_id")),
    periode: str(f.get("periode")),
    montant: num(f.get("montant")) ?? 0,
    date_encaissement: str(f.get("date_encaissement")),
    mode: str(f.get("mode")),
    statut: str(f.get("statut")) ?? "encaisse",
  }, `/admin/gestion/${str(f.get("mandat_id")) ?? ""}`)
}

export async function createTravaux(f: FormData): Promise<Result> {
  const titre = str(f.get("titre"))
  if (!titre) return { ok: false, error: "Titre requis." }
  return insert("travaux", {
    property_id: str(f.get("property_id")),
    mandat_id: str(f.get("mandat_id")),
    proprietaire_id: str(f.get("proprietaire_id")),
    prestataire_id: str(f.get("prestataire_id")),
    titre,
    description: str(f.get("description")),
    cout: num(f.get("cout")),
    statut: str(f.get("statut")) ?? "demande",
  }, `/admin/gestion/${str(f.get("mandat_id")) ?? ""}`)
}

export async function createVersement(f: FormData): Promise<Result> {
  const brut = num(f.get("montant_brut")) ?? 0
  const commission = num(f.get("commission")) ?? 0
  const frais = num(f.get("frais_travaux")) ?? 0
  return insert("versements", {
    proprietaire_id: str(f.get("proprietaire_id")),
    mandat_id: str(f.get("mandat_id")),
    property_id: str(f.get("property_id")),
    periode: str(f.get("periode")),
    montant_brut: brut,
    commission,
    frais_travaux: frais,
    montant_net: Math.max(0, brut - commission - frais),
    date_versement: str(f.get("date_versement")),
    mode: str(f.get("mode")),
    statut: str(f.get("statut")) ?? "planifie",
  }, `/admin/gestion/${str(f.get("mandat_id")) ?? ""}`)
}
