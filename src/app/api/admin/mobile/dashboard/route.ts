import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, refus } from "@/lib/admin-mobile"

// ============================================================================
// TABLEAU DE BORD — les chiffres du jour, en une seule requête réseau.
//
// Tout est compté côté serveur (`head: true`, aucune ligne transportée) : sur
// un téléphone en 3G, rapatrier les données pour les compter serait lent et
// coûteux, et c'est ce genre de lecture qui a fait sauter le quota Supabase le
// 09/09/2026.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ilYA = (jours: number) => new Date(Date.now() - jours * 86400_000).toISOString()

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const db = createAdminClient()
  const compte = (t: string) => db.from(t).select("id", { count: "exact", head: true })

  const [
    publiees, enAttente, signalees, aujourdhui, semaine,
    leads30j, transactionsMois, vehicules, locationsEnCours,
    { data: dernieres },
  ] = await Promise.all([
    compte("properties").eq("statut", "publie"),
    compte("properties").eq("statut", "en_attente_validation"),
    db.from("signalements").select("id", { count: "exact", head: true }).eq("statut", "nouveau"),
    compte("properties").gte("created_at", ilYA(1)),
    compte("properties").gte("created_at", ilYA(7)),
    compte("leads").gte("created_at", ilYA(30)),
    compte("transactions").gte("created_at", ilYA(30)),
    compte("vehicules").eq("publie", true),
    db.from("locations_vehicule").select("id", { count: "exact", head: true }).eq("statut", "en_cours"),
    db.from("properties")
      .select("id,reference,titre,statut,prix,quartier,ville,created_at")
      .order("created_at", { ascending: false }).limit(8),
  ])

  // Ingestion WhatsApp : c'est la santé de la collecte, et ce qui tombe le plus
  // souvent. Un compte « en reconnexion » signifie que plus rien n'entre.
  const { data: comptes } = await db.from("whatsapp_accounts")
    .select("nom,numero,role,statut:status,dernier_ping").order("nom")
  const { count: enAttenteIngestion } = await db.from("whatsapp_messages")
    .select("id", { count: "exact", head: true }).eq("traite", false)

  const n = (r: { count: number | null }) => r.count ?? 0
  return NextResponse.json({
    annonces: {
      publiees: n(publiees), enAttente: n(enAttente), signalees: n(signalees),
      aujourdhui: n(aujourdhui), semaine: n(semaine),
    },
    commerce: { leads30j: n(leads30j), transactions30j: n(transactionsMois) },
    vehicules: { enLigne: n(vehicules), locationsEnCours: n(locationsEnCours) },
    ingestion: {
      messagesEnAttente: enAttenteIngestion ?? 0,
      comptes: (comptes ?? []) as { nom: string; numero: string; role: string; statut: string; dernier_ping: string | null }[],
    },
    dernieres: dernieres ?? [],
  })
}
