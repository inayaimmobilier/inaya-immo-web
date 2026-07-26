import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { uploadToR2, r2Configured, publicUrlForKey } from "@/lib/r2"
import { userIdFromAuthHeader } from "@/lib/mobile-session"

// ============================================================================
// Publication d'un bien DEPUIS L'APP mobile. Crée une annonce « en attente de
// validation » (comme le web) + envoie les PHOTOS (images) vers R2. Les vidéos
// ne sont pas acceptées ici (limite de corps serverless) : l'agent les ajoute.
// Bearer facultatif : si présent, on rattache l'auteur (created_by).
// ============================================================================
export const runtime = "nodejs"
export const maxDuration = 60

const OFFRES = new Set(["location", "vente", "cession", "residence_meublee"])
const CATS = new Set(["maison", "appartement", "studio", "terrain", "local_commercial", "bureau", "magasin", "autre"])
const CAT_LABEL: Record<string, string> = { maison: "Maison", appartement: "Appartement", studio: "Studio", terrain: "Terrain", local_commercial: "Local commercial", bureau: "Bureau", magasin: "Magasin", autre: "Bien" }
const MAX_IMG_BYTES = 6 * 1024 * 1024
const MAX_IMAGES = 6

// Anti-abus simple par IP.
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000)
  recent.push(now); hits.set(ip, recent)
  return recent.length > 6
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnu"
  if (rateLimited(ip)) return NextResponse.json({ error: "Trop de publications. Réessayez dans une minute." }, { status: 429 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const s = (k: string) => (form.get(k) as string | null)?.trim() || null
  const n = (k: string) => { const v = Number((form.get(k) as string | null)?.replace(/[^\d]/g, "")); return Number.isFinite(v) && v > 0 ? v : null }

  const type_offre = s("type_offre") ?? ""
  const categorie = s("categorie") ?? ""
  const ville = s("commune") || "Bouaké"
  const quartier = s("quartier")
  const description = s("description")
  const proprietaire_telephone = s("telephone")
  const proprietaire_nom = s("nom")

  if (!OFFRES.has(type_offre)) return NextResponse.json({ error: "Type d'offre invalide." }, { status: 400 })
  if (!CATS.has(categorie)) return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 })
  if (!proprietaire_telephone || proprietaire_telephone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "Un numéro de contact valide est requis." }, { status: 400 })
  }
  if (!description || description.length < 10) return NextResponse.json({ error: "Décrivez le bien (au moins 10 caractères)." }, { status: 400 })

  const isResid = type_offre === "residence_meublee"
  const titre = s("titre") || `${CAT_LABEL[categorie] ?? "Bien"} ${quartier ? `– ${quartier}` : `à ${ville}`}`.trim()
  const createdBy = userIdFromAuthHeader(req.headers.get("authorization"))

  const admin = createAdminClient()
  const payload: Record<string, unknown> = {
    titre, description, type_offre, categorie,
    prix: n("prix"), charges: 0,
    quartier, ville, meuble: isResid,
    surface: n("surface"), nb_pieces: n("nb_pieces"), nb_chambres: n("nb_chambres"),
    proprietaire_nom, proprietaire_telephone,
    statut: "en_attente_validation", source: "plateforme",
    ...(createdBy ? { created_by: createdBy } : {}),
  }

  let { data: prop, error } = await admin.from("properties").insert(payload as never).select("id, reference").single()
  if (error?.code === "42703") {
    // Colonnes récentes absentes → repli en versant les infos propriétaire dans la description.
    const { proprietaire_nom: _pn, proprietaire_telephone: _pt, ...base } = payload
    base.description = [description, `Contact publieur (interne) : ${[proprietaire_nom, proprietaire_telephone].filter(Boolean).join(" · ")}`].filter(Boolean).join("\n\n")
    const retry = await admin.from("properties").insert(base as never).select("id, reference").single()
    prop = retry.data; error = retry.error
  }
  if (error || !prop) { console.error("INAYA-MPUB-001", error?.message); return NextResponse.json({ error: "Enregistrement impossible. Réessayez." }, { status: 500 }) }

  const propId = (prop as { id: string }).id
  const reference = (prop as { reference: number | null }).reference

  // Photos → R2 (best-effort : l'annonce est créée même si l'upload échoue).
  const files = (form.getAll("photos") as File[]).filter(f => f && typeof f === "object").slice(0, MAX_IMAGES)
  let uploaded = 0
  if (files.length && r2Configured()) {
    let ordre = 0
    for (const file of files) {
      if (!file.type?.startsWith("image/") || file.size > MAX_IMG_BYTES) continue
      const ext = (file.name?.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
      const key = `properties/${propId}/${Date.now()}_${ordre}.${ext}`
      try {
        await uploadToR2(key, Buffer.from(await file.arrayBuffer()), file.type)
        const { error: mErr } = await admin.from("property_media").insert({ property_id: propId, url: publicUrlForKey(key), type: "image", ordre } as never)
        if (!mErr) { uploaded++; ordre++ }
      } catch (e) { console.error("INAYA-MPUB-MEDIA", (e as Error).message) }
    }
  }

  return NextResponse.json({ ok: true, id: propId, reference, photos: uploaded })
}
