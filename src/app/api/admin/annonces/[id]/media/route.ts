import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { uploadToR2, r2Configured } from "@/lib/r2"
import type { UserRole } from "@/types/database"

// ffmpeg nécessite le runtime Node (pas Edge) ; la compression vidéo peut être longue.
export const runtime = "nodejs"
export const maxDuration = 120

const STAFF_ROLES: UserRole[] = ["super_admin", "admin", "moderateur", "agent"]
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 Mo (vidéos brutes, compressées ensuite)
const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024))

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: profileData } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  if (!r2Configured()) {
    return NextResponse.json({ error: "Stockage R2 non configuré sur ce serveur" }, { status: 503 })
  }

  const { id: propertyId } = await params

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 })
  }
  const files = formData.getAll("files") as File[]
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 })

  const admin = createAdminClient()

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
      errors.push(`${file.name} dépasse la limite de ${MAX_MB} Mo`)
      continue
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    const stamp = `${Date.now()}_${nextOrdre}`

    try {
      const raw = Buffer.from(await file.arrayBuffer())

      if (isVideo) {
        // Compression mobile (≤720p) + miniature ; fallback brut si ffmpeg échoue.
        let videoBuf: Buffer = raw
        let thumbnailUrl: string | null = null
        try {
          const { compressVideo } = await import("@/lib/video")
          const out = await compressVideo(raw)
          videoBuf = out.video
          if (out.thumbnail) {
            thumbnailUrl = await uploadToR2(`properties/${propertyId}/${stamp}_thumb.jpg`, out.thumbnail, "image/jpeg")
          }
        } catch {
          // ffmpeg indisponible/échec → on stocke la vidéo telle quelle
        }
        const url = await uploadToR2(`properties/${propertyId}/${stamp}.mp4`, videoBuf, "video/mp4")
        const { data: row, error } = await admin
          .from("property_media")
          .insert({ property_id: propertyId, type: "video", url, thumbnail_url: thumbnailUrl, ordre: nextOrdre++, taille_bytes: videoBuf.length } as never)
          .select().single()
        if (error) { errors.push(`DB erreur : ${error.message}`); continue }
        created.push(row)
      } else {
        const mime = file.type || "image/jpeg"
        const url = await uploadToR2(`properties/${propertyId}/${stamp}.${ext}`, raw, mime)
        const { data: row, error } = await admin
          .from("property_media")
          .insert({ property_id: propertyId, type: "image", url, ordre: nextOrdre++, taille_bytes: raw.length } as never)
          .select().single()
        if (error) { errors.push(`DB erreur : ${error.message}`); continue }
        created.push(row)
      }
    } catch (e) {
      errors.push(`Upload ${file.name} : ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ created, errors }, { status: created.length > 0 ? 200 : 400 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: profileData } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { id: propertyId } = await params
  const { mediaId } = await req.json() as { mediaId: string }
  if (!mediaId) return NextResponse.json({ error: "mediaId manquant" }, { status: 400 })

  const admin = createAdminClient()
  const { data: media } = await admin
    .from("property_media").select("id, url").eq("id", mediaId).eq("property_id", propertyId).single()
  if (!media) return NextResponse.json({ error: "Introuvable" }, { status: 404 })

  const { url } = media as { url: string; id: string }

  // Suppression R2 best-effort
  if (r2Configured()) {
    try {
      const { urlToKey, deleteFromR2 } = await import("@/lib/r2")
      const key = urlToKey(url)
      if (key) await deleteFromR2(key)
    } catch { /* si R2 échoue, on supprime quand même de la DB */ }
  }

  await admin.from("property_media").delete().eq("id", mediaId)
  return NextResponse.json({ ok: true })
}
