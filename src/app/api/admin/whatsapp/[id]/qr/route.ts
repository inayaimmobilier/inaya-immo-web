import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import QRCode from "qrcode"

// Génère un PNG du QR d'appairage Baileys pour un compte WhatsApp.
// Accessible uniquement aux admins. Polling toutes les 3s depuis QrDisplay.tsx
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profile as { role: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { id } = await params
  const { data } = await supabase
    .from("whatsapp_accounts")
    .select("qr_data, qr_expires_at, status")
    .eq("id", id)
    .single()

  if (!data) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  const row = data as { qr_data: string | null; qr_expires_at: string | null; status: string }

  // Plus de QR : compte déjà connecté ou QR expiré
  if (!row.qr_data) {
    return NextResponse.json({ status: row.status, qr: false })
  }

  // QR expiré
  if (row.qr_expires_at && new Date(row.qr_expires_at) < new Date()) {
    return NextResponse.json({ status: row.status, qr: false, expired: true })
  }

  // Génère le PNG
  const png = await QRCode.toBuffer(row.qr_data, { width: 280, margin: 2 })
  return new NextResponse(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  })
}
