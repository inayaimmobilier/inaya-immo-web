import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// NOTIFICATIONS — tout ce que la plateforme envoie, au même endroit.
//
// Alertes de match, assignations de tâches, codes de vérification, relances :
// c'est le même tuyau, et c'est en le regardant qu'on voit si les clients sont
// prévenus. Un envoi en ÉCHEC est un client qui n'a jamais su qu'un bien
// correspondait à sa recherche.
//
// Les échecs passent donc devant, et le résumé compte séparément ce qui attend,
// ce qui est parti et ce qui a échoué.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 25

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const etat = p.get("etat") ?? "echec"
  const type = p.get("type") ?? ""
  const page = Math.max(1, Number(p.get("page") ?? 1))
  const admin = createAdminClient()

  let q = admin.from("notifications")
    .select("id,canal,type,titre,contenu,contact_telephone,envoye,envoye_le,erreur,code_erreur,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAR_PAGE, page * PAR_PAGE - 1)

  if (etat === "echec") q = q.not("erreur", "is", null)
  else if (etat === "attente") q = q.eq("envoye", false).is("erreur", null)
  else if (etat === "envoye") q = q.eq("envoye", true)
  if (type) q = q.eq("type", type)

  const [{ data, count, error }, resume] = await Promise.all([
    q,
    (async () => {
      const [att, env, ech] = await Promise.all([
        admin.from("notifications").select("id", { count: "exact", head: true }).eq("envoye", false).is("erreur", null),
        admin.from("notifications").select("id", { count: "exact", head: true }).eq("envoye", true)
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
        admin.from("notifications").select("id", { count: "exact", head: true }).not("erreur", "is", null),
      ])
      return { enAttente: att.count ?? 0, envoyees7j: env.count ?? 0, enEchec: ech.count ?? 0 }
    })(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const voitNumeros = peut(staff.role, "numeros")
  type Ligne = {
    id: string; canal: string; type: string; titre: string | null; contenu: string
    contact_telephone: string | null; envoye: boolean; envoye_le: string | null
    erreur: string | null; code_erreur: string | null; created_at: string
  }

  return NextResponse.json({
    notifications: ((data ?? []) as Ligne[]).map(n => ({
      id: n.id, canal: n.canal, type: n.type, titre: n.titre, contenu: n.contenu,
      destinataire: voitNumeros ? n.contact_telephone : null,
      envoye: n.envoye, envoye_le: n.envoye_le,
      erreur: n.erreur, code_erreur: n.code_erreur, created_at: n.created_at,
    })),
    resume,
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAR_PAGE)),
  })
}
