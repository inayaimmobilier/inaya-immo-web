import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { presignPutUrl, publicUrlForKey, uploadToR2, r2Configured } from "@/lib/r2"

// Upload de l'image d'illustration d'un service (admin). Deux voies :
//  - JSON { name, contentType }  → URL présignée (PUT direct navigateur → R2,
//    gère les gros fichiers — nécessite le CORS du bucket) ;
//  - FormData { file }           → proxy serveur → R2 (sans CORS, ≤ 4 Mo Vercel).
// Le client tente le direct puis bascule sur le proxy en cas d'échec.
export const runtime = "nodejs"

// SÉCURITÉ : images uniquement (pas de .html/.svg servis depuis le domaine médias).
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp"])
const MAX_PROXY_BYTES = 4 * 1024 * 1024

async function checkAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (prof as { role?: string } | null)?.role
  return role === "super_admin" || role === "admin"
}

function keyFor(name: string): { key: string; ext: string } | null {
  const clean = (name || "image").replace(/[^\w.-]/g, "_")
  const ext = (clean.split(".").pop() ?? "jpg").toLowerCase()
  if (!IMAGE_EXTS.has(ext)) return null
  return { key: `services/${Date.now()}.${ext}`, ext }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  if (!r2Configured()) return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 })

  const ctype = req.headers.get("content-type") ?? ""

  // ── Voie 1 : présignature (PUT direct navigateur → R2) ─────────────────────
  if (ctype.includes("application/json")) {
    const body = await req.json().catch(() => null) as { name?: string; contentType?: string } | null
    if (!body?.name) return NextResponse.json({ error: "name requis" }, { status: 400 })
    const k = keyFor(body.name)
    if (!k) return NextResponse.json({ error: "Format non accepté (image uniquement)." }, { status: 415 })
    const contentType = body.contentType?.startsWith("image/") ? body.contentType : "image/jpeg"
    const uploadUrl = await presignPutUrl(k.key, contentType)
    return NextResponse.json({ key: k.key, uploadUrl, publicUrl: publicUrlForKey(k.key), contentType })
  }

  // ── Voie 2 : proxy serveur (sans CORS, ≤ 4 Mo) ─────────────────────────────
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Corps invalide" }, { status: 400 }) }
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
  if (file.size > MAX_PROXY_BYTES) {
    return NextResponse.json({ error: "Image trop lourde pour cette voie (max ~4 Mo). Réduisez-la ou configurez le CORS R2." }, { status: 413 })
  }
  const k = keyFor(file.name)
  if (!k) return NextResponse.json({ error: "Format non accepté (image uniquement)." }, { status: 415 })
  const contentType = file.type.startsWith("image/") ? file.type : "image/jpeg"
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    await uploadToR2(k.key, buf, contentType)
    return NextResponse.json({ publicUrl: publicUrlForKey(k.key) })
  } catch (e) {
    return NextResponse.json({ error: `Envoi échoué : ${(e as Error).message}` }, { status: 500 })
  }
}
