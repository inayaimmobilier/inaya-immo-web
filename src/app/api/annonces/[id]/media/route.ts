import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { uploadToR2, r2Configured, publicUrlForKey } from "@/lib/r2"

// Endpoint public : permet aux propriétaires d'ajouter des médias juste après
// avoir soumis leur annonce, sans compte. Sécurité : la propriété doit être
// en attente, de source 'proprietaire', créée il y a moins de 2 heures.
export const runtime = "nodejs"
export const maxDuration = 120

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const MAX_FILE_BYTES = 200 * 1024 * 1024
const MAX_MB = 200
const WINDOW_MS = 2 * 60 * 60 * 1000 // 2 heures

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 })
  }

  const { id: propertyId } = await params
  const admin = createAdminClient()

  // Vérifier que le bien existe, est en attente et récent (< 2h)
  const { data: prop } = await admin
    .from("properties")
    .select("id, statut, source, created_at")
    .eq("id", propertyId)
    .single()

  if (!prop) return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 })

  const p = prop as { id: string; statut: string; source: string; created_at: string }
  if (p.source !== "proprietaire" || p.statut !== "en_attente_validation") {
    return NextResponse.json({ error: "Upload non autorisé" }, { status: 403 })
  }
  if (Date.now() - new Date(p.created_at).getTime() > WINDOW_MS) {
    return NextResponse.json({ error: "Délai d'upload expiré (2h). Contactez-nous." }, { status: 403 })
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 })
  }
  const files = formData.getAll("files") as File[]
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })

  // Rang de départ
  const { data: existing } = await admin
    .from("property_media").select("ordre")
    .eq("property_id", propertyId)
    .order("ordre", { ascending: false }).limit(1)
  let nextOrdre = ((existing?.[0] as { ordre: number } | undefined)?.ordre ?? -1) + 1

  const created: unknown[] = []
  const errors: string[] = []

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name} dépasse ${MAX_MB} Mo`)
      continue
    }
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    const stamp = `${Date.now()}_${nextOrdre}`

    try {
      const raw = Buffer.from(await file.arrayBuffer())

      if (isVideo) {
        let videoBuf: Buffer = raw
        let thumbnailUrl: string | null = null
        try {
          const { compressVideo } = await import("@/lib/video")
          const out = await compressVideo(raw)
          videoBuf = out.video
          if (out.thumbnail) {
            thumbnailUrl = await uploadToR2(
              `properties/${propertyId}/${stamp}_thumb.jpg`,
              out.thumbnail, "image/jpeg",
            )
          }
        } catch { /* fallback brut */ }
        const url = await uploadToR2(`properties/${propertyId}/${stamp}.mp4`, videoBuf, "video/mp4")
        const { data: row, error } = await admin.from("property_media")
          .insert({ property_id: propertyId, type: "video", url, thumbnail_url: thumbnailUrl, ordre: nextOrdre++, taille_bytes: videoBuf.length, } as never)
          .select().single()
        if (error) { errors.push(`DB: ${error.message}`); continue }
        created.push(row)
      } else {
        const mime = file.type || "image/jpeg"
        const url = await uploadToR2(`properties/${propertyId}/${stamp}.${ext}`, raw, mime)
        const { data: row, error } = await admin.from("property_media")
          .insert({ property_id: propertyId, type: "image", url, ordre: nextOrdre++, taille_bytes: raw.length, } as never)
          .select().single()
        if (error) { errors.push(`DB: ${error.message}`); continue }
        created.push(row)
      }
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ created, errors }, { status: created.length > 0 ? 200 : 400 })
}

/**
 * Enregistre en base des médias déjà uploadés DIRECTEMENT sur R2 (URL présignée),
 * pour contourner la limite de corps serverless. Mêmes garde-fous que le POST.
 * Body : { items: [{ key, type }] }.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await params
  const admin = createAdminClient()

  const { data: prop } = await admin.from("properties")
    .select("id, statut, source, created_at").eq("id", propertyId).single()
  const p = prop as { statut: string; source: string; created_at: string } | null
  if (!p) return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 })
  if (p.source !== "proprietaire" || p.statut !== "en_attente_validation")
    return NextResponse.json({ error: "Upload non autorisé" }, { status: 403 })
  if (Date.now() - new Date(p.created_at).getTime() > WINDOW_MS)
    return NextResponse.json({ error: "Délai d'upload expiré (2h)." }, { status: 403 })

  let body: { items?: { key?: string; type?: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const items = (body.items ?? []).filter(it => it.key)
  if (items.length === 0) return NextResponse.json({ error: "Aucun média" }, { status: 400 })

  const { data: existing } = await admin.from("property_media").select("ordre")
    .eq("property_id", propertyId).order("ordre", { ascending: false }).limit(1)
  let nextOrdre = ((existing?.[0] as { ordre: number } | undefined)?.ordre ?? -1) + 1

  const created: unknown[] = []
  const errors: string[] = []
  for (const it of items) {
    const type = it.type === "video" ? "video" : "image"
    const { data: row, error } = await admin.from("property_media")
      .insert({ property_id: propertyId, type, url: publicUrlForKey(it.key!), ordre: nextOrdre++ } as never)
      .select().single()
    if (error) { errors.push(`DB: ${error.message}`); continue }
    created.push(row)
  }
  return NextResponse.json({ created, errors }, { status: created.length > 0 ? 200 : 400 })
}
