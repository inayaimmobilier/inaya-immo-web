import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// ÉTAT DE L'INGESTION WHATSAPP.
//
// Pour chaque compte : son état de connexion, son rôle, le nombre de groupes
// dont il est MEMBRE et le nombre qu'il ÉCOUTE réellement. La distinction est
// tout sauf théorique — en septembre 2026, un numéro était membre de 206
// groupes mais n'en écoutait que 26, et les 23 groupes qui produisent 93 % des
// annonces n'étaient surveillés par aucun numéro joignable.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const URL_SERVICE = process.env.WA_SERVICE_URL ?? ""
const SECRET_SERVICE = process.env.WA_HTTP_SECRET ?? ""

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")
  const admin = createAdminClient()

  const [{ data: comptes }, { data: groupes }] = await Promise.all([
    admin.from("whatsapp_accounts")
      .select("id,nom,numero,role,engine,actif,status,reconnexions_count,dernier_ping,groupes_surveilles")
      .order("nom"),
    admin.from("whatsapp_groups").select("id,nom,account_id,nb_participants"),
  ])

  const lignes = (comptes ?? []) as {
    id: string; nom: string; numero: string; role: string; engine: string
    actif: boolean; status: string; reconnexions_count: number
    dernier_ping: string | null; groupes_surveilles: unknown
  }[]
  const tousGroupes = (groupes ?? []) as { id: string; nom: string | null; account_id: string; nb_participants: number | null }[]

  // Le service tourne-t-il ? Répondre « on ne sait pas » vaut mieux que de
  // laisser croire que tout va bien parce que la base répond.
  let service: { joignable: boolean; detail?: unknown } = { joignable: false }
  if (URL_SERVICE) {
    try {
      const r = await fetch(`${URL_SERVICE}/health`, {
        headers: SECRET_SERVICE ? { "x-inaya-secret": SECRET_SERVICE } : {},
        signal: AbortSignal.timeout(3000),
      })
      service = { joignable: r.ok, detail: r.ok ? await r.json() : undefined }
    } catch { service = { joignable: false } }
  }

  return NextResponse.json({
    comptes: lignes.map(c => {
      const surveilles = Array.isArray(c.groupes_surveilles) ? c.groupes_surveilles.length : 0
      return {
        id: c.id, nom: c.nom, numero: c.numero, role: c.role, engine: c.engine,
        actif: c.actif, statut: c.status, reconnexions: c.reconnexions_count,
        dernier_ping: c.dernier_ping,
        membre_de: tousGroupes.filter(g => g.account_id === c.id).length,
        surveille: surveilles,
      }
    }),
    service,
    droits: { gerer: peut(staff.role, "parametres") },
  })
}
