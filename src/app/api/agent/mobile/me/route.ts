import { NextRequest, NextResponse } from "next/server"
import { agentDepuisEntete, estAdministration, refus, CANAUX, STATUTS_CLIENT, ETAPES_PROPOSITION } from "@/lib/agent-mobile"

// ============================================================================
// Qui suis-je ?
//
// Interrogée au démarrage. Elle renvoie aussi les VOCABULAIRES (canaux,
// statuts, étapes) : l'application les affiche sans les avoir codés en dur,
// donc ajouter une étape côté serveur n'oblige pas à republier un APK sur le
// téléphone de chaque agent.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  return NextResponse.json({
    agent: { id: agent.userId, nom: agent.nom, role: agent.role, telephone: agent.telephone },
    droits: {
      // L'administration voit et modifie tout ; un agent ne modifie que ses
      // propres fiches, mais voit celles des autres.
      toutModifier: estAdministration(agent.role),
    },
    vocabulaire: {
      canaux: CANAUX,
      statutsClient: STATUTS_CLIENT,
      etapes: ETAPES_PROPOSITION,
    },
  })
}
