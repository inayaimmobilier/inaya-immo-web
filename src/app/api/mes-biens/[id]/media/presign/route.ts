import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { presignPutUrl, publicUrlForKey, r2Configured } from "@/lib/r2"

// URLs présignées pour l'upload direct navigateur → R2, côté PROPRIÉTAIRE
// CONNECTÉ (espace /proprietaire/biens/[id]). Authentifié : l'utilisateur doit
// posséder le bien (property_publishers.publisher_id = son id). Aucune limite
// de temps (contrairement à la route publique /api/annonces limitée à 2h) : un
// propriétaire peut gérer les médias de ses biens à vie.
export const runtime = "nodejs"

const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"])
const MAX_FILE_BYTES = 200 * 1024 * 1024

/** Vérifie l'auth + la propriété du bien. Renvoie l'id user ou une Response d'erreur. */
async function assertOwner(propertyId: string): Promise<string | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const admin = createAdminClient()
  const { data: pub } = await admin
    .from("property_publishers").select("id").eq("property_id", propertyId).eq("publisher_id", user.id).maybeSingle()
  if (!pub) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  return user.id
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!r2Configured()) return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 })
  const { id: propertyId } = await params
  const guard = await assertOwner(propertyId)
  if (guard instanceof NextResponse) return guard

  let body: { files?: { name?: string; contentType?: string; size?: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const files = body.files ?? []
  if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 })
  if (files.length > 20) return NextResponse.json({ error: "20 fichiers maximum" }, { status: 400 })

  const items: { key: string; uploadUrl: string; publicUrl: string; type: "image" | "video"; contentType: string }[] = []
  const errors: string[] = []
  let i = 0
  for (const f of files) {
    const name = (f.name ?? "fichier").replace(/[^\w.-]/g, "_")
    if ((f.size ?? 0) > MAX_FILE_BYTES) { errors.push(`${name} dépasse 200 Mo`); continue }
    const ext = (name.split(".").pop() ?? "jpg").toLowerCase()
    const isVideo = VIDEO_EXTS.has(ext)
    const contentType = f.contentType || (isVideo ? "video/mp4" : "image/jpeg")
    const key = `properties/${propertyId}/${Date.now()}_${i++}.${ext}`
    try {
      const uploadUrl = await presignPutUrl(key, contentType)
      items.push({ key, uploadUrl, publicUrl: publicUrlForKey(key), type: isVideo ? "video" : "image", contentType })
    } catch (e) { errors.push(`${name} : ${(e as Error).message}`) }
  }
  return NextResponse.json({ items, errors })
}
