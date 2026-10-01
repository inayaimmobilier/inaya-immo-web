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
export const maxDuration = 60

const PAR_PAGE = 25
/** Notification périmée au redémarrage du service (jamais envoyée, et c'est voulu). */
const OBSOLETE = "INAYA-NOTIF-013"

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const etat = p.get("etat") ?? "echec"
  const type = p.get("type") ?? ""
  const page = Math.max(1, Number(p.get("page") ?? 1))
  const admin = createAdminClient()

  let q = admin.from("notifications")
    .select("id,canal,type,titre,contenu,contact_telephone,envoye,envoye_le,erreur,code_erreur,created_at,payload", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAR_PAGE, page * PAR_PAGE - 1)

  // Les échecs RÉELS : une notification périmée au redémarrage n'est pas un
  // client oublié — elle a sa propre ligne (et son bouton de nettoyage).
  if (etat === "echec") q = q.not("erreur", "is", null).or(`code_erreur.is.null,code_erreur.neq.${OBSOLETE}`)
  else if (etat === "obsolete") q = q.eq("code_erreur", OBSOLETE)
  else if (etat === "attente") q = q.eq("envoye", false).is("erreur", null)
  else if (etat === "envoye") q = q.eq("envoye", true)
  if (type) q = q.eq("type", type)

  const [{ data, count, error }, resume] = await Promise.all([
    q,
    (async () => {
      const [att, env, ech, obs] = await Promise.all([
        admin.from("notifications").select("id", { count: "exact", head: true }).eq("envoye", false).is("erreur", null),
        admin.from("notifications").select("id", { count: "exact", head: true }).eq("envoye", true)
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
        admin.from("notifications").select("id", { count: "exact", head: true }).not("erreur", "is", null)
          .or(`code_erreur.is.null,code_erreur.neq.${OBSOLETE}`),
        admin.from("notifications").select("id", { count: "exact", head: true }).eq("code_erreur", OBSOLETE),
      ])
      return { enAttente: att.count ?? 0, envoyees7j: env.count ?? 0, enEchec: ech.count ?? 0, obsoletes: obs.count ?? 0 }
    })(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const voitNumeros = peut(staff.role, "numeros")
  type Ligne = {
    id: string; canal: string; type: string; titre: string | null; contenu: string
    contact_telephone: string | null; envoye: boolean; envoye_le: string | null
    erreur: string | null; code_erreur: string | null; created_at: string
    payload: Record<string, unknown> | null
  }

  return NextResponse.json({
    notifications: ((data ?? []) as Ligne[]).map(n => ({
      id: n.id, canal: n.canal, type: n.type, titre: n.titre, contenu: n.contenu,
      destinataire: voitNumeros ? n.contact_telephone : null,
      envoye: n.envoye, envoye_le: n.envoye_le,
      erreur: n.erreur, code_erreur: n.code_erreur, created_at: n.created_at,
      // Ce que la notification concerne : la toucher ouvre le lead ou l'annonce.
      lead_id: typeof n.payload?.lead_id === "string" ? n.payload.lead_id : null,
      property_id: typeof n.payload?.property_id === "string" ? n.payload.property_id : null,
    })),
    resume,
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAR_PAGE)),
  })
}

/**
 * Suppression : une sélection (`ids`), ou toutes les notifications périmées
 * (`obsoletes: true`), par lots pour rester sous le délai SQL. Renvoie ce qui
 * reste à nettoyer : l'application relance tant qu'il en reste.
 */
export async function DELETE(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  if (!peut(staff.role, "supprimer")) return refus("acces_refuse")

  let corps: { ids?: unknown; obsoletes?: unknown }
  try { corps = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }
  const admin = createAdminClient()

  if (Array.isArray(corps.ids)) {
    const ids = corps.ids.filter((x): x is string => typeof x === "string").slice(0, 500)
    if (!ids.length) return NextResponse.json({ error: "rien_a_supprimer" }, { status: 400 })
    const { error } = await admin.from("notifications").delete().in("id", ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, supprimees: ids.length, restantes: 0 })
  }

  if (corps.obsoletes === true) {
    let supprimees = 0
    const fin = Date.now() + 40_000
    while (Date.now() < fin) {
      const { data } = await admin.from("notifications").select("id").eq("code_erreur", OBSOLETE).limit(500)
      const ids = ((data ?? []) as { id: string }[]).map(x => x.id)
      if (!ids.length) break
      const { error } = await admin.from("notifications").delete().in("id", ids)
      if (error) return NextResponse.json({ error: error.message, supprimees }, { status: 500 })
      supprimees += ids.length
    }
    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("code_erreur", OBSOLETE)
    return NextResponse.json({ ok: true, supprimees, restantes: count ?? 0 })
  }
  return NextResponse.json({ error: "rien_a_supprimer" }, { status: 400 })
}
