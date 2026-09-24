import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { staffDepuisEntete, peut, masquerNumeros, refus } from "@/lib/admin-mobile"

// ============================================================================
// MESSAGES WHATSAPP EN ATTENTE DE TRAITEMENT.
//
// Le tableau de bord annonce « 52 messages en attente » : encore faut-il
// pouvoir les ouvrir. Un message bloqué, c'est une annonce qui n'existe pas —
// et la seule façon de comprendre pourquoi est de lire son texte et son erreur.
//
// Trois familles, distinguées par `etat` :
//  - en_attente : jamais traité, en file ;
//  - en_cours   : pris par un agent, normalement quelques secondes ;
//  - en_echec   : tentatives épuisées, il faut une décision humaine.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAR_PAGE = 25

export async function GET(req: NextRequest) {
  const staff = await staffDepuisEntete(req.headers.get("authorization"))
  if (!staff) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const etat = p.get("etat") ?? "en_attente"
  const page = Math.max(1, Number(p.get("page") ?? 1))
  const admin = createAdminClient()

  let q = admin.from("whatsapp_messages")
    .select("id,contenu,sender_name,sender,group_id,recu_le,tentatives,erreur_traitement,en_traitement,traite,type,property_id", { count: "exact" })
    .order("recu_le", { ascending: false })
    .range((page - 1) * PAR_PAGE, page * PAR_PAGE - 1)

  if (etat === "en_attente") q = q.eq("traite", false).eq("en_traitement", false).lt("tentatives", 3)
  else if (etat === "en_cours") q = q.eq("traite", false).eq("en_traitement", true)
  else if (etat === "en_echec") q = q.eq("traite", false).gte("tentatives", 3)
  // « tous » = tous les NON TRAITÉS. Cet écran sert à débloquer l'ingestion,
  // pas à relire l'historique : compter les 65 000 messages déjà traités
  // dépassait le délai maximal et renvoyait une erreur.
  else q = q.eq("traite", false)

  // Le tableau de bord compte TOUS les non traités ; la liste, elle, en filtre
  // une famille. Sans ces compteurs, « 83 messages en attente » s'ouvrait sur
  // une liste vide — le chiffre et l'écran ne parlaient pas du même ensemble.
  const compte = (f: (r: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    f(base()).then(r => r.count ?? 0)
  const base = () => admin.from("whatsapp_messages").select("id", { count: "exact", head: true })

  const [{ data, count, error }, enAttente, enCours, enEchec, total] = await Promise.all([
    q,
    compte(b => b.eq("traite", false).eq("en_traitement", false).lt("tentatives", 3)),
    compte(b => b.eq("traite", false).eq("en_traitement", true)),
    compte(b => b.eq("traite", false).gte("tentatives", 3)),
    compte(b => b.eq("traite", false)),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lignes = (data ?? []) as {
    id: string; contenu: string | null; sender_name: string | null; sender: string | null
    group_id: string | null; recu_le: string; tentatives: number
    erreur_traitement: string | null; en_traitement: boolean; traite: boolean
    type: string | null; property_id: string | null
  }[]

  // Nom des groupes : une seule requête pour la page.
  const idsGroupes = [...new Set(lignes.map(l => l.group_id).filter((x): x is string => !!x))]
  const nomGroupe = new Map<string, string>()
  if (idsGroupes.length) {
    const { data: g } = await admin.from("whatsapp_groups").select("id,nom").in("id", idsGroupes)
    for (const x of (g ?? []) as { id: string; nom: string | null }[]) if (x.nom) nomGroupe.set(x.id, x.nom)
  }

  const voitNumeros = peut(staff.role, "numeros")
  return NextResponse.json({
    messages: lignes.map(l => ({
      id: l.id,
      // Le texte brut porte le numéro de l'annonceur : même règle que partout.
      contenu: l.contenu ? (voitNumeros ? l.contenu : masquerNumeros(l.contenu)) : null,
      expediteur: l.sender_name,
      groupe: l.group_id ? (nomGroupe.get(l.group_id) ?? "Groupe inconnu") : "Message privé",
      recu_le: l.recu_le,
      tentatives: l.tentatives,
      erreur: l.erreur_traitement,
      etat: l.traite ? "traite" : l.en_traitement ? "en_cours" : l.tentatives >= 3 ? "en_echec" : "en_attente",
      property_id: l.property_id,
    })),
    resume: { enAttente, enCours, enEchec, total },
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAR_PAGE)),
  })
}
