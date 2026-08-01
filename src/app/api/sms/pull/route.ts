import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// ============================================================================
// RETRAIT des SMS en attente par le téléphone passerelle.
//
// Appelé toutes les quelques secondes par l'application Android. La réponse
// doit donc être minuscule et rapide : on ne renvoie que ce qui est prêt, et
// on marque immédiatement les messages comme pris pour qu'un second appel —
// ou un second appareil — ne les envoie pas une deuxième fois.
//
// Authentification par jeton partagé : le téléphone n'a pas de session.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LOT_MAX = 10

function jetonValide(req: NextRequest): boolean {
  const attendu = process.env.SMS_GATEWAY_TOKEN
  if (!attendu) return false // pas de jeton configuré = passerelle fermée
  const entete = req.headers.get("authorization")
  const fourni = entete?.match(/^Bearer\s+(.+)$/i)?.[1] ?? req.nextUrl.searchParams.get("token")
  return fourni === attendu
}

export async function GET(req: NextRequest) {
  if (!jetonValide(req)) return NextResponse.json({ error: "non_autorise" }, { status: 401 })

  const deviceId = (req.nextUrl.searchParams.get("device") ?? "inconnu").slice(0, 64)
  const admin = createAdminClient()
  const maintenant = new Date().toISOString()

  try {
    // Les périmés ne partent jamais : une alerte « ce bien vient d'arriver »
    // envoyée le lendemain dessert plus qu'elle ne sert.
    await admin.from("sms_queue")
      .update({ statut: "echec", erreur: "expiré avant envoi" } as never)
      .eq("statut", "en_attente").lt("expire_le", maintenant)

    // Reprise : un message pris mais jamais confirmé depuis 5 minutes revient
    // dans la file — le téléphone a pu s'éteindre entre-temps.
    await admin.from("sms_queue")
      .update({ statut: "en_attente" } as never)
      .eq("statut", "envoi_en_cours")
      .lt("pris_le", new Date(Date.now() - 5 * 60_000).toISOString())

    const { data, error } = await admin.from("sms_queue")
      .select("id,telephone,message,type")
      .eq("statut", "en_attente")
      .order("priorite", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(LOT_MAX)
    if (error) { console.error("INAYA-SMSQ-PULL", error.message); return NextResponse.json({ messages: [] }) }

    const lot = (data ?? []) as { id: string; telephone: string; message: string; type: string }[]
    if (lot.length === 0) return NextResponse.json({ messages: [] })

    // Marqué pris AVANT de répondre : sans cela, deux appels rapprochés
    // enverraient le même SMS deux fois.
    await admin.from("sms_queue")
      .update({ statut: "envoi_en_cours", pris_le: maintenant, device_id: deviceId } as never)
      .in("id", lot.map(m => m.id))

    return NextResponse.json({ messages: lot })
  } catch (e) {
    console.error("INAYA-SMSQ-PULL-2", e)
    return NextResponse.json({ messages: [] })
  }
}
