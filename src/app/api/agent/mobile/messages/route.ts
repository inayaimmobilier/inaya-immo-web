import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, estAdministration, refus } from "@/lib/agent-mobile"
import { rendre, coutSms } from "@/lib/messages-agent"
import { enfilerSms, passerelleActive } from "@/lib/sms-gateway"

// ============================================================================
// ENVOI GROUPÉ.
//
// Inviter vingt clients à laisser un témoignage, annoncer une nouveauté à
// ceux qui cherchent dans ce quartier. Le texte est rendu POUR CHACUN — le
// prénom change d'un message à l'autre, c'est tout l'intérêt.
//
// ── DEUX GARDE-FOUS ────────────────────────────────────────────────────────
//
// 1. On n'envoie qu'à SES clients. Écrire aux clients d'un collègue en son nom
//    brouillerait la relation et la commission.
// 2. `apercu` est le mode par défaut du bon sens : l'application montre
//    d'abord le coût et le nombre de destinataires. Un envoi groupé se paie et
//    engage le numéro de l'agence ; il ne doit jamais partir d'un doigt qui
//    glisse.
//
// Le plafond de 100 n'est pas technique : c'est le seuil au-delà duquel un
// message « personnel » n'en est plus un, et où la passerelle se ferait
// remarquer.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PLAFOND = 100

export async function POST(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  let c: { client_ids?: string[]; modele_id?: string; texte?: string; canal?: string; apercu?: boolean }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const ids = (c.client_ids ?? []).filter(Boolean).slice(0, PLAFOND)
  if (!ids.length) return NextResponse.json({ error: "aucun_destinataire" }, { status: 400 })

  const canal = c.canal === "sms" ? "sms" : "whatsapp"
  const admin = createAdminClient()

  let requete = admin.from("agent_clients")
    .select("id,nom,telephone,agent_id").in("id", ids)
  if (!estAdministration(agent.role)) requete = requete.eq("agent_id", agent.userId)
  const { data: dataClients, error } = await requete
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clients = (dataClients ?? []) as { id: string; nom: string; telephone: string; agent_id: string }[]
  if (!clients.length) return NextResponse.json({ error: "aucun_destinataire" }, { status: 400 })
  const ecartes = ids.length - clients.length

  // Le corps.
  let corps = (c.texte ?? "").trim()
  let modeleTitre: string | null = null
  if (c.modele_id) {
    const { data } = await admin.from("message_templates")
      .select("titre,corps,agent_id").eq("id", c.modele_id).maybeSingle()
    const m = data as { titre: string; corps: string; agent_id: string | null } | null
    if (!m) return NextResponse.json({ error: "modele_introuvable" }, { status: 404 })
    if (!corps) corps = m.corps
    modeleTitre = m.titre
  }
  if (!corps) return NextResponse.json({ error: "message_vide" }, { status: 400 })

  const rendus = clients.map(cl => {
    const texte = rendre(corps, {
      client: { nom: cl.nom },
      agent: { nom: agent.nom, telephone: agent.telephone },
      bien: null,
    })
    const numero = cl.telephone.replace(/\D/g, "").slice(-10)
    return {
      client_id: cl.id, nom: cl.nom, telephone: cl.telephone, texte,
      lien_whatsapp: `https://wa.me/225${numero}?text=${encodeURIComponent(texte)}`,
    }
  })

  if (c.apercu) {
    const segments = rendus.reduce((s, r) => s + coutSms(r.texte).segments, 0)
    return NextResponse.json({
      apercu: true,
      destinataires: rendus.length,
      ecartes,
      segments,
      passerelle: canal === "sms" ? await passerelleActive() : null,
      messages: rendus,
    })
  }

  // ── WhatsApp : rien ne part d'ici ────────────────────────────────────────
  //
  // WhatsApp exige un geste par destinataire, sur le téléphone de l'agent.
  // Le serveur rend les textes et les liens ; l'application les enchaîne.
  if (canal === "whatsapp") {
    return NextResponse.json({ ok: true, canal, destinataires: rendus.length, ecartes, messages: rendus })
  }

  // ── SMS : la passerelle prend tout en charge ─────────────────────────────
  let envoyes = 0
  const echecs: { nom: string; raison: string }[] = []
  const evenements: Record<string, unknown>[] = []

  for (const r of rendus) {
    const ok = await enfilerSms({ telephone: r.telephone, message: r.texte, type: "notification" })
    if (ok) {
      envoyes++
      evenements.push({
        agent_client_id: r.client_id, auteur_id: agent.userId, type: "sms",
        contenu: `${modeleTitre ? `${modeleTitre} — ` : ""}Envoi groupé.\n${r.texte}`,
      })
    } else {
      echecs.push({ nom: r.nom, raison: "numéro hors Côte d'Ivoire, ou passerelle indisponible" })
    }
  }

  // Un seul appel : cent insertions ligne à ligne sur une connexion de
  // terrain, c'est cent occasions d'échouer à mi-chemin.
  if (evenements.length) await admin.from("client_events").insert(evenements as never)

  return NextResponse.json({ ok: true, canal, envoyes, ecartes, echecs })
}
