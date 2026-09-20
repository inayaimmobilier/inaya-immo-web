import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// QR CODE D'APPAIRAGE.
//
// Le service écrit le QR en base (durée de vie 90 secondes) et l'application
// l'affiche. On renvoie l'image en base64 plutôt qu'un lien : l'application
// n'aurait pas de jeton à joindre à une balise image, et le QR n'a rien à faire
// dans une URL publique — il donne l'accès au compte WhatsApp.
//
// Absence de QR : ce n'est PAS forcément une panne. Soit le compte est déjà
// connecté, soit WhatsApp refuse l'appairage (erreur 405) — auquel cas insister
// aggrave la restriction. Le message le dit.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "parametres")) return refus("acces_refuse")

  const { id } = await ctx.params
  const admin = createAdminClient()
  const { data } = await admin.from("whatsapp_accounts")
    .select("nom,status,qr_data,qr_expires_at").eq("id", id).maybeSingle()
  if (!data) return NextResponse.json({ error: "introuvable" }, { status: 404 })

  const c = data as { nom: string; status: string; qr_data: string | null; qr_expires_at: string | null }
  const perime = c.qr_expires_at ? new Date(c.qr_expires_at).getTime() < Date.now() : true

  if (!c.qr_data || perime) {
    return NextResponse.json({
      qr: null, statut: c.status,
      message: c.status === "connecte"
        ? "Ce compte est déjà connecté."
        : "Aucun QR disponible pour l'instant. Le service en publie un nouveau toutes les 90 secondes tant que le compte est actif ; si rien n'apparaît au bout de quelques minutes, WhatsApp refuse l'appairage depuis le serveur.",
    })
  }

  const QRCode = (await import("qrcode")).default
  const png = await QRCode.toBuffer(c.qr_data, { width: 320, margin: 2 })
  return NextResponse.json({
    qr: `data:image/png;base64,${png.toString("base64")}`,
    statut: c.status,
    expire_le: c.qr_expires_at,
  })
}
