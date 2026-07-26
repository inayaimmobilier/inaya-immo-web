// ============================================================================
// Collecte automatique des pharmacies de garde. L'admin définit des URLs sources
// (app_settings « pharmacies_sources »). Un agent IA lit chaque page, en extrait
// les pharmacies du jour (JSON) et remplace la garde en base. Déclenché
// quotidiennement (cron) ou manuellement depuis l'admin.
//   Nécessite un fournisseur LLM configuré (Admin → Paramètres → Assistant IA).
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"
import { llmComplete } from "@/lib/llm"

const SETTING_KEY = "pharmacies_sources"

export async function getPharmacySources(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("value").eq("key", SETTING_KEY).maybeSingle()
    const v = (data as { value: unknown } | null)?.value
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
  } catch { /* table absente */ }
  return []
}

export async function setPharmacySources(urls: string[]): Promise<void> {
  const clean = urls.map(u => u.trim()).filter(u => /^https?:\/\//i.test(u)).slice(0, 20)
  const admin = createAdminClient()
  await admin.from("app_settings").upsert({ key: SETTING_KEY, value: clean } as never, { onConflict: "key" })
}

interface Pharma { nom: string; ville?: string; quartier?: string; telephone?: string; adresse?: string }

/** HTML → texte lisible (suffisant pour l'extraction). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)
}

const EXTRACT_SYSTEM = `Tu extrais les PHARMACIES DE GARDE (de nuit / du jour) d'un texte de page web ivoirienne.
Renvoie UNIQUEMENT un tableau JSON, sans aucun texte autour, au format :
[{"nom":"...","ville":"...","quartier":"...","telephone":"...","adresse":"..."}]
Règles : n'invente rien ; si un champ est absent, mets une chaîne vide. Si le texte ne contient aucune pharmacie de garde, renvoie [].`

async function scrapeSource(url: string): Promise<{ ok: true; items: Pharma[] } | { ok: false; error: string }> {
  let text: string
  try {
    const res = await fetch(url, { headers: { "user-agent": "InayaBot/1.0 (+https://www.inaya.ci)" }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    text = htmlToText(await res.text())
  } catch { return { ok: false, error: "page injoignable" } }
  if (text.length < 40) return { ok: false, error: "page vide" }

  const r = await llmComplete(EXTRACT_SYSTEM, `URL: ${url}\n\nTEXTE:\n${text}`, 1500)
  if (!r.ok) return { ok: false, error: r.error }
  const m = r.text.match(/\[[\s\S]*\]/)
  if (!m) return { ok: true, items: [] }
  try {
    const arr = JSON.parse(m[0]) as Pharma[]
    const items = (Array.isArray(arr) ? arr : []).filter(p => p && typeof p.nom === "string" && p.nom.trim())
    return { ok: true, items }
  } catch { return { ok: false, error: "JSON invalide" } }
}

/** Rafraîchit la garde du jour à partir de toutes les sources. */
export async function refreshPharmaciesDeGarde(): Promise<{ ok: boolean; count: number; sources: number; errors: string[] }> {
  const sources = await getPharmacySources()
  if (sources.length === 0) return { ok: false, count: 0, sources: 0, errors: ["Aucune source configurée."] }

  const all: Pharma[] = []
  const errors: string[] = []
  for (const url of sources) {
    const r = await scrapeSource(url)
    if (r.ok) all.push(...r.items)
    else errors.push(`${url} → ${r.error}`)
  }
  // Dédoublonnage grossier par nom+ville.
  const seen = new Set<string>()
  const uniq = all.filter(p => { const k = `${p.nom}|${p.ville ?? ""}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  if (uniq.length === 0) return { ok: false, count: 0, sources: sources.length, errors: errors.length ? errors : ["Aucune pharmacie extraite."] }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  // Désactive la garde précédente puis insère la nouvelle (garde du jour).
  await admin.from("pharmacies_garde").update({ actif: false } as never).eq("actif", true).then(() => {}, () => {})
  const rows = uniq.map(p => ({
    nom: p.nom.trim(), ville: (p.ville || "").trim() || "Bouaké",
    quartier: (p.quartier || "").trim() || null, adresse: (p.adresse || "").trim() || null,
    telephone: (p.telephone || "").trim() || null, date_debut: today, date_fin: today, actif: true, source: "ia",
  }))
  let { error } = await admin.from("pharmacies_garde").insert(rows as never)
  if (error?.code === "42703") {
    // Colonne « source » absente → réessai sans.
    const bare = rows.map(({ source: _s, ...r }) => r)
    error = (await admin.from("pharmacies_garde").insert(bare as never)).error
  }
  if (error) { console.error("INAYA-PHARMA-REFRESH", error.message); return { ok: false, count: 0, sources: sources.length, errors: [error.message] } }
  return { ok: true, count: rows.length, sources: sources.length, errors }
}
