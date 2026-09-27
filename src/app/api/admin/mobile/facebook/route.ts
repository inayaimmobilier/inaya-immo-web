import { NextRequest, NextResponse } from "next/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// IMPORTER UNE PUBLICATION FACEBOOK à partir de son lien.
//
// Le site ne lit pas Facebook lui-même : il relaie au service d'ingestion, qui
// dispose de yt-dlp, de ffmpeg et du pipeline complet (IA, dédoublonnage,
// modération, médias R2). L'annonce créée suit le circuit habituel —
// « en attente de validation » jusqu'à l'avis de la modération.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Lecture de la publication (~15 s) + classification IA : bien au-delà des 10 s par défaut.
export const maxDuration = 120

const WA_SERVICE_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3099"

export async function POST(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "moderer")) return refus("acces_refuse")

  const { url, texte } = (await req.json().catch(() => ({}))) as { url?: string; texte?: string }
  if (!url?.trim()) return NextResponse.json({ error: "Collez le lien de la publication." }, { status: 400 })

  let res: Response
  try {
    res = await fetch(`${WA_SERVICE_URL}/facebook/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-inaya-secret": process.env.WA_HTTP_SECRET ?? "" },
      // Texte collé par l'agent (facultatif) : fait foi sur celui, souvent tronqué, de Facebook.
      body: JSON.stringify({ url: url.trim(), texte: typeof texte === "string" ? texte.slice(0, 8000) : undefined }),
      signal: AbortSignal.timeout(110_000),
    })
  } catch {
    return NextResponse.json({ error: "Service d'ingestion injoignable. Réessayez dans un instant." }, { status: 503 })
  }

  const corps = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const brut = String(corps.error ?? `Erreur ${res.status}`)
    // Codes internes → phrase lisible pour l'agent.
    const message = /INAYA-FB-020/.test(brut) ? "Ce lien n'est pas un lien Facebook."
      : /INAYA-FB-011/.test(brut) ? "Publication illisible : elle est privée, supprimée, ou réservée aux membres d'un groupe."
      : res.status === 404 ? "Le service d'ingestion n'est pas encore à jour. Réessayez après son redéploiement."
      : brut.replace(/^INAYA-[A-Z]+-\d+\s*/, "")
    return NextResponse.json({ error: message }, { status: res.status >= 500 ? 502 : res.status })
  }
  return NextResponse.json(corps)
}
