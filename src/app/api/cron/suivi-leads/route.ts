import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// SUIVI QUOTIDIEN DES DEMANDES (leads) — deux passages par jour (vercel.json) :
//
//  ?mode=matin (8 h) : récapitulatif au staff des demandes restées « nouveau »
//    depuis plus de 24 h — sans lui, 87 dossiers sur 92 étaient restés sans
//    suite (constat du 01/10/2026).
//  ?mode=soir (17 h) : rappel des visites du LENDEMAIN au client et au
//    propriétaire / annonceur (migration 069 : visite_le, visite_rappel_le).
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true
  if (req.nextUrl.searchParams.get("secret") === secret) return true
  if (req.headers.get("x-vercel-cron")) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const mode = req.nextUrl.searchParams.get("mode") === "soir" ? "soir" : "matin"
  const admin = createAdminClient()
  return NextResponse.json(mode === "matin" ? await recapitulatif(admin) : await rappelsVisites(admin))
}

async function recapitulatif(admin: ReturnType<typeof createAdminClient>) {
  const hier = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true })
    .eq("statut", "nouveau").lt("created_at", hier)
  const enAttente = count ?? 0
  if (enAttente === 0) return { mode: "matin", enAttente: 0 }

  const { data } = await admin.from("leads").select("contact_nom,created_at,properties(titre)")
    .eq("statut", "nouveau").lt("created_at", hier).order("created_at", { ascending: false }).limit(3)
  const exemples = ((data ?? []) as { contact_nom: string | null; created_at: string; properties: { titre: string } | { titre: string }[] | null }[])
    .map(l => {
      const t = (Array.isArray(l.properties) ? l.properties[0] : l.properties)?.titre ?? "un bien"
      const jours = Math.max(1, Math.round((Date.now() - new Date(l.created_at).getTime()) / 86_400_000))
      return `• ${l.contact_nom ?? "Client"} — ${t.slice(0, 50)} (${jours} j)`
    })
  const { notifyStaff } = await import("@/lib/notifications")
  await notifyStaff({
    type: "rappel_leads",
    titre: `${enAttente} demande${enAttente > 1 ? "s" : ""} en attente`,
    contenu: `${enAttente} demande${enAttente > 1 ? "s" : ""} de client${enAttente > 1 ? "s" : ""} attend${enAttente > 1 ? "ent" : ""} une réponse depuis plus de 24 h :\n${exemples.join("\n")}${enAttente > 3 ? "\n…" : ""}`,
    payload: { ecran: "leads" },
  })
  return { mode: "matin", enAttente }
}

async function rappelsVisites(admin: ReturnType<typeof createAdminClient>) {
  // Visites de DEMAIN (journée UTC = heure d'Abidjan), pas encore rappelées.
  const demain = new Date(); demain.setUTCDate(demain.getUTCDate() + 1); demain.setUTCHours(0, 0, 0, 0)
  const apres = new Date(demain); apres.setUTCDate(apres.getUTCDate() + 1)
  const { data, error } = await admin.from("leads")
    .select("id,contact_nom,contact_telephone,visite_le,property_id,properties(titre,reference)")
    .gte("visite_le", demain.toISOString()).lt("visite_le", apres.toISOString())
    .is("visite_rappel_le", null).neq("statut", "abandonne").limit(200)
  if (error) return { mode: "soir", erreur: error.message }  // migration 069 absente

  const { notifyPhone } = await import("@/lib/notifications")
  const { telephonesProprietaire, dateVisite, journaliser } = await import("@/lib/lead-suivi")
  let rappels = 0
  for (const l of (data ?? []) as { id: string; contact_nom: string | null; contact_telephone: string | null; visite_le: string; property_id: string; properties: { titre: string; reference: number | null } | { titre: string; reference: number | null }[] | null }[]) {
    const b = Array.isArray(l.properties) ? l.properties[0] : l.properties
    const quoi = b ? `« ${b.titre} »${b.reference ? ` (N°${b.reference})` : ""}` : "le bien"
    const quand = dateVisite(l.visite_le)
    await notifyPhone({ telephone: l.contact_telephone, type: "rappel_visite", titre: "Inaya Immo — rappel de visite",
      contenu: `Bonjour${l.contact_nom ? ` ${l.contact_nom}` : ""}, rappel : votre visite de ${quoi} est prévue demain, ${quand}. À demain !`,
      payload: { lead_id: l.id } })
    for (const tel of await telephonesProprietaire(admin, l.property_id)) {
      await notifyPhone({ telephone: tel, type: "rappel_visite", titre: "Inaya Immo — rappel de visite",
        contenu: `Bonjour, rappel : la visite de votre bien ${quoi} avec un client d'Inaya Immo est prévue demain, ${quand}.`,
        payload: { lead_id: l.id } })
    }
    await admin.from("leads").update({ visite_rappel_le: new Date().toISOString() } as never).eq("id", l.id)
    await journaliser(admin, l.id, { type: "visite", detail: "Rappel de la veille envoyé au client et au propriétaire" })
    rappels++
  }
  return { mode: "soir", rappels }
}
