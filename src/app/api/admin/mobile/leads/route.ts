import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, refus } from "@/lib/admin-mobile"

// ============================================================================
// TÂCHES ET LEADS — le suivi commercial.
//
// Un lead EST une tâche : son statut décrit où en est le dossier, de « nouveau »
// à « conclu ». C'est ce que l'agent fait avancer sur le terrain, et la raison
// première d'avoir cette application en poche.
//
// Les leads dont le client attend le plus viennent en premier — les « nouveau »
// avant les dossiers déjà engagés — et à statut égal, les plus anciens d'abord :
// un lead qui traîne est un client qui a déjà appelé ailleurs.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 20

/** Ordre de traitement, du plus urgent au moins urgent. */
const URGENCE: Record<string, number> = {
  nouveau: 0, en_traitement: 1, contacte: 2, visite_planifiee: 3,
  visite_effectuee: 4, paiement_planifie: 5, conclu: 6, abandonne: 7,
}

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const statut = p.get("statut") ?? ""
  const q = (p.get("q") ?? "").trim()
  const page = Math.max(1, Number(p.get("page") ?? 1))
  const admin = createAdminClient()

  let requete = admin.from("leads")
    .select("id,statut,message,canal,created_at,contact_nom,contact_telephone,agent_id,rdv_paiement_le,compte_rendu,properties(id,reference,titre,quartier,ville,prix)", { count: "exact" })
    .order("created_at", { ascending: false })
  if (statut) requete = requete.eq("statut", statut)
  if (q) {
    const motif = `%${q.replace(/[%,()]/g, " ")}%`
    requete = requete.or(`contact_nom.ilike.${motif},contact_telephone.ilike.${motif},message.ilike.${motif}`)
  }

  // On lit large puis on trie par urgence : le tri utile n'est pas la date
  // seule, et PostgREST ne sait pas ordonner sur une table de priorités.
  const { data, count, error } = await requete.range(0, 399)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Ligne = {
    id: string; statut: string; message: string | null; canal: string; created_at: string
    contact_nom: string | null; contact_telephone: string | null; agent_id: string | null
    rdv_paiement_le: string | null; compte_rendu: string | null
    properties: { id: string; reference: number | null; titre: string; quartier: string | null; ville: string | null; prix: number | null } | null
  }
  const lignes = (data ?? []) as unknown as Ligne[]
  const triees = [...lignes].sort((a, b) =>
    (URGENCE[a.statut] ?? 9) - (URGENCE[b.statut] ?? 9) ||
    a.created_at.localeCompare(b.created_at))

  const voitNumeros = peut(staff.role, "numeros")
  const debut = (page - 1) * PAR_PAGE

  return NextResponse.json({
    leads: triees.slice(debut, debut + PAR_PAGE).map(l => ({
      id: l.id, statut: l.statut, message: l.message, canal: l.canal,
      created_at: l.created_at,
      contact_nom: l.contact_nom,
      // Le numéro du CLIENT reste visible par tout le staff : c'est lui qu'on
      // rappelle. Seul celui du propriétaire est réservé aux administrateurs.
      contact_telephone: l.contact_telephone,
      rdv_paiement_le: l.rdv_paiement_le,
      compte_rendu: l.compte_rendu,
      pris_en_charge: !!l.agent_id,
      annonce: l.properties
        ? { id: l.properties.id, reference: l.properties.reference, titre: l.properties.titre,
            quartier: l.properties.quartier, ville: l.properties.ville, prix: l.properties.prix }
        : null,
    })),
    total: count ?? triees.length,
    page,
    pages: Math.max(1, Math.ceil(triees.length / PAR_PAGE)),
    droits: { modifier: peut(staff.role, "moderer"), numeros: voitNumeros },
  })
}
