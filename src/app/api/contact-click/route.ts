// ============================================================================
// Enregistrement d'une PRISE DE CONTACT sur une annonce (WhatsApp / appel).
// Endpoint et non server action : le visiteur quitte la page pour WhatsApp dans
// la foulée, et seul `sendBeacon` survit à cette navigation.
// Best-effort absolu — ce suivi ne doit jamais retarder ni empêcher le contact.
// ============================================================================
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { propertyId, canal, vid, avecContact } = (await req.json()) as {
      propertyId?: string; canal?: string; vid?: string; avecContact?: boolean
    }
    if (!propertyId || !UUID.test(propertyId)) return NextResponse.json({ ok: true })

    await createAdminClient().from("contact_clicks").insert({
      property_id: propertyId,
      canal: canal === "appel" ? "appel" : "whatsapp",
      visitor_id: vid ? String(vid).slice(0, 64) : null,
      avec_contact: avecContact === true,
    } as never)
    return NextResponse.json({ ok: true })
  } catch {
    // Table absente (migration 052 non appliquée) ou corps invalide → on ignore.
    return NextResponse.json({ ok: true })
  }
}
