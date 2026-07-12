import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { publicUrlForKey, r2Configured } from "@/lib/r2"

// Enregistrement + suppression de médias côté PROPRIÉTAIRE CONNECTÉ (espace
// /proprietaire/biens/[id]). Authentifié par propriété (property_publishers).
// Pas de limite de temps : un propriétaire gère les médias de ses biens à vie.
export const runtime = "nodejs"

/** Vérifie l'auth + la propriété du bien. */
async function assertOwner(propertyId: string): Promise<NextResponse | true> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  const admin = createAdminClient()
  const { data: pub } = await admin
    .from("property_publishers").select("id").eq("property_id", propertyId).eq("publisher_id", user.id).maybeSingle()
  if (!pub) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  return true
}

/**
 * Enregistre en base des médias déjà uploadés DIRECTEMENT sur R2 (via URL
 * présignée). Body : { items: [{ key, type }] }.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await params
  const guard = await assertOwner(propertyId)
  if (guard !== true) return guard

  let body: { items?: { key?: string; type?: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const items = (body.items ?? []).filter(it => it.key)
  if (items.length === 0) return NextResponse.json({ error: "Aucun média à enregistrer" }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin.from("property_media").select("ordre")
    .eq("property_id", propertyId).order("ordre", { ascending: false }).limit(1)
  let nextOrdre = ((existing?.[0] as { ordre: number } | undefined)?.ordre ?? -1) + 1

  const created: unknown[] = []
  const errors: string[] = []
  for (const it of items) {
    const type = it.type === "video" ? "video" : "image"
    const url = publicUrlForKey(it.key!)
    const { data: row, error } = await admin.from("property_media")
      .insert({ property_id: propertyId, type, url, ordre: nextOrdre++ } as never)
      .select().single()
    if (error) { errors.push(`DB : ${error.message}`); continue }
    created.push(row)
  }
  return NextResponse.json({ created, errors }, { status: created.length > 0 ? 200 : 400 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await params
  const guard = await assertOwner(propertyId)
  if (guard !== true) return guard

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
