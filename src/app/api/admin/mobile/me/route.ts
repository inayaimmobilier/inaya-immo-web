import { NextRequest, NextResponse } from "next/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// Qui suis-je, et qu'ai-je le droit de faire ?
//
// L'application interroge cette route au démarrage : elle n'affiche que les
// écrans et les boutons autorisés. Les droits restent évidemment revérifiés à
// chaque action — une interface n'est pas une sécurité.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  return NextResponse.json({
    staff: { id: staff.userId, nom: staff.nom, role: staff.role },
    droits: {
      moderer: peut(staff.role, "moderer"),
      supprimer: peut(staff.role, "supprimer"),
      numeros: peut(staff.role, "numeros"),
      parametres: peut(staff.role, "parametres"),
    },
  })
}
