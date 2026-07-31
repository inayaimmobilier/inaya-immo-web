import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { botToken, tgSetCommands } from "@/lib/telegram/api"

// ============================================================================
// Branchement du bot : déclare l'URL du webhook et le menu de commandes auprès
// de Telegram. Réservé à un administrateur connecté — il suffit d'ouvrir
// /api/telegram/setup dans le navigateur, une fois, après un changement de
// domaine ou de jeton.
// ============================================================================
export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: string } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 })
  }

  const token = botToken()
  if (!token) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN absent." }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin
  const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }

  await tgSetCommands([
    { command: "menu", description: "Tableau de bord" },
    { command: "attente", description: "Annonces à valider" },
    { command: "annonces", description: "Chercher une annonce" },
    { command: "stats", description: "Statistiques" },
    { command: "comptes", description: "Utilisateurs" },
    { command: "nouveau_compte", description: "Créer un compte" },
    { command: "notifs", description: "Choisir mes alertes" },
    { command: "aide", description: "Aide" },
  ])

  return NextResponse.json({
    ok: body.ok === true,
    webhook: url,
    secret_configure: !!secret,
    telegram: body.description ?? "webhook enregistré",
  })
}
