import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// CONNECTER / DÉCONNECTER UN COMPTE WHATSAPP.
//
// `actif` est l'interrupteur que lit le service d'ingestion à chaque
// réconciliation (toutes les 30 secondes) : à false il ferme la connexion, à
// true il la rouvre. On ne coupe donc rien ici — on demande, et le service
// exécute.
//
// Utile au quotidien : un numéro qui tourne en boucle de reconnexion use son
// crédit de tentatives auprès de WhatsApp. Le désactiver le temps de régler la
// cause vaut mieux que de le laisser s'acharner.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "parametres")) return refus("acces_refuse")

  const { id } = await ctx.params
  let corps: { actif?: boolean }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  if (typeof corps.actif !== "boolean") {
    return NextResponse.json({ error: "actif_requis" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("whatsapp_accounts")
    .update({ actif: corps.actif } as never).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true, actif: corps.actif,
    // Le changement n'est pas instantané : le dire évite de croire à un échec.
    message: corps.actif
      ? "Connexion demandée. Le service la rouvre dans la minute."
      : "Déconnexion demandée. Le service ferme la connexion dans la minute.",
  })
}
