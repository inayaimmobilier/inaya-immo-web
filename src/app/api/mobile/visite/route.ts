import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { notifyNewLead, notifyClientVisiteRecue, notifyProprietaireVisite } from "@/lib/notifications"
import { absoluteUrl } from "@/lib/site"

// ============================================================================
// API publique de l'app mobile — DEMANDE DE VISITE / RÉSERVATION.
// Même flux que le formulaire web /biens/[id] : lead + notifications (staff,
// client WhatsApp/SMS, propriétaire avec lien de validation /rdv/{leadId}).
// ============================================================================
export const runtime = "nodejs"

// Anti-abus léger (endpoint public) : 5 demandes / 10 min / IP.
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 600_000)
  recent.push(now); hits.set(ip, recent)
  if (hits.size > 2000) for (const [k, v] of hits) if (v.every(t => now - t >= 600_000)) hits.delete(k)
  return recent.length > 5
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?"
  if (limited(ip)) return NextResponse.json({ error: "Trop de demandes — réessayez dans quelques minutes." }, { status: 429 })

  let body: { property_id?: string; nom?: string; telephone?: string; creneau?: string; message?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }) }
  const nom = body.nom?.trim()
  const tel = body.telephone?.trim()
  const propertyId = body.property_id?.trim()
  if (!nom || !tel || !propertyId || !/^[0-9a-f-]{36}$/i.test(propertyId)) {
    return NextResponse.json({ error: "Nom, téléphone et annonce requis." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: propData } = await admin.from("properties")
    .select("id, statut, titre, quartier, type_offre").eq("id", propertyId).maybeSingle()
  const prop = propData as { id: string; statut: string; titre: string; quartier: string | null; type_offre: string } | null
  if (!prop || prop.statut !== "publie") return NextResponse.json({ error: "Cette annonce n'est plus disponible." }, { status: 404 })
  const reservation = prop.type_offre === "residence_meublee"

  const token = randomUUID()
  const payload: Record<string, unknown> = {
    property_id: propertyId,
    contact_nom: nom, contact_telephone: tel,
    canal: "app", message: body.message?.trim() || null,
    creneaux: body.creneau?.trim() ? [{ souhaite: body.creneau.trim() }] : [],
    statut: "nouveau", validation_token: token,
  }
  let { data: leadData, error } = await admin.from("leads").insert(payload as never).select("id").single()
  if (error?.code === "42703") { // colonnes récentes absentes → réessai minimal
    const { validation_token: _t, ...base } = payload
    const retry = await admin.from("leads").insert(base as never).select("id").single()
    leadData = retry.data; error = retry.error
  }
  if (error?.code === "23514" || error?.message?.includes("canal")) { // canal 'app' non accepté → 'web'
    const retry = await admin.from("leads").insert({ ...payload, canal: "web" } as never).select("id").single()
    leadData = retry.data; error = retry.error
  }
  if (error || !leadData) {
    console.error("INAYA-MOB-010", error)
    return NextResponse.json({ error: "Échec de l'envoi. Réessayez." }, { status: 500 })
  }
  const leadId = (leadData as { id: string }).id

  // Notifications best-effort (jamais bloquantes pour le client).
  try {
    await notifyNewLead({
      propertyTitre: prop.titre, quartier: prop.quartier,
      contactNom: nom, contactTel: tel, creneau: body.creneau?.trim() || null,
      leadId, propertyId,
    })
    await notifyClientVisiteRecue({ contactTel: tel, contactNom: nom, propertyTitre: prop.titre, quartier: prop.quartier, reservation })
    const { data: pub } = await admin.from("property_publishers")
      .select("contact_phone").eq("property_id", propertyId)
      .order("rang", { ascending: true }).limit(1).maybeSingle()
    const ownerTel = (pub as { contact_phone: string | null } | null)?.contact_phone ?? null
    if (ownerTel) {
      await notifyProprietaireVisite({
        ownerTel, propertyTitre: prop.titre, quartier: prop.quartier,
        creneau: body.creneau?.trim() || null,
        validationUrl: absoluteUrl(`/rdv/${leadId}`), reservation,
      })
    }
  } catch (e) { console.error("INAYA-MOB-011", e) }

  return NextResponse.json({ ok: true })
}
