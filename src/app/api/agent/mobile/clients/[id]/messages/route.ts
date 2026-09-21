import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus, verrou } from "@/lib/agent-mobile"
import { rendre, coutSms, siteUrl, type ContexteMessage } from "@/lib/messages-agent"
import { enfilerSms } from "@/lib/sms-gateway"
import { sendSms } from "@/lib/sms"

// ============================================================================
// ENVOYER UN MESSAGE À UN CLIENT.
//
// Trois canaux, et ils ne se valent pas :
//
//   sms            → part du numéro d'Inaya, par la passerelle. L'agent n'a
//                    rien d'autre à faire, et cela ne coûte rien à son forfait.
//   whatsapp       → part du numéro DE L'AGENT. Plus personnel, et c'est
//                    souvent ce qu'il faut ; mais il doit appuyer sur envoyer.
//   sms_telephone  → son application SMS s'ouvre, texte prêt.
//
// Pour les deux derniers, le serveur ne peut pas savoir si le message est
// réellement parti. L'historique le dit donc dans ces mots-là — « préparé » —
// plutôt que d'affirmer un envoi qu'il n'a pas constaté.
//
// `apercu: true` ne fait que rendre le texte : c'est ce que l'agent relit
// avant de décider. Le remplissage des variables se fait ici et nulle part
// ailleurs, pour que l'aperçu soit exactement ce qui partira.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CANAUX = ["sms", "whatsapp", "sms_telephone"]

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const { id } = await ctx.params
  const acces = await verrou(agent, id, "ecriture")
  if ("echec" in acces) return acces.echec
  const client = acces.client

  let c: {
    modele_id?: string; texte?: string; canal?: string
    property_id?: string; proposition_id?: string; apercu?: boolean
  }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  const canal = CANAUX.includes(c.canal ?? "") ? c.canal! : "whatsapp"
  const admin = createAdminClient()

  // Le corps : un modèle, ou un texte écrit à la main.
  let corps = (c.texte ?? "").trim()
  let modeleTitre: string | null = null
  if (c.modele_id) {
    const { data } = await admin.from("message_templates")
      .select("titre,corps,agent_id").eq("id", c.modele_id).maybeSingle()
    const m = data as { titre: string; corps: string; agent_id: string | null } | null
    if (!m) return NextResponse.json({ error: "modele_introuvable" }, { status: 404 })
    if (m.agent_id && m.agent_id !== agent.userId) {
      return NextResponse.json({ error: "modele_d_un_collegue" }, { status: 403 })
    }
    // Un texte fourni l'emporte : l'agent a retouché l'aperçu avant d'envoyer.
    if (!corps) corps = m.corps
    modeleTitre = m.titre
  }
  if (!corps) return NextResponse.json({ error: "message_vide" }, { status: 400 })

  // Le bien cité, s'il y en a un.
  let bien: ContexteMessage["bien"] = null
  const bienId = c.property_id ?? (c.proposition_id ? await bienDeLaProposition(admin, c.proposition_id) : null)
  if (bienId) {
    const { data } = await admin.from("properties")
      .select("id,titre,reference").eq("id", bienId).maybeSingle()
    bien = data as ContexteMessage["bien"]
  }

  const texte = rendre(corps, {
    client: { nom: client.nom },
    agent: { nom: agent.nom, telephone: agent.telephone },
    bien,
  })

  const cout = coutSms(texte)
  const numero = client.telephone.replace(/\D/g, "").slice(-10)

  if (c.apercu) {
    return NextResponse.json({
      apercu: true, texte, cout,
      lien_whatsapp: `https://wa.me/225${numero}?text=${encodeURIComponent(texte)}`,
      lien_sms: `sms:${numero}?body=${encodeURIComponent(texte)}`,
    })
  }

  // ── Envoi ────────────────────────────────────────────────────────────────
  let etat: "envoye" | "prepare"
  let detail: string

  if (canal === "sms") {
    const enFile = await enfilerSms({ telephone: client.telephone, message: texte, type: "notification" })
    if (enFile) {
      etat = "envoye"
      detail = "SMS remis à la passerelle Inaya."
    } else if (process.env.AT_API_KEY) {
      await sendSms(client.telephone, texte, { type: "notification" })
      etat = "envoye"
      detail = "SMS remis au fournisseur."
    } else {
      // Ni passerelle ni fournisseur : le dire, plutôt que de laisser l'agent
      // croire que son client a été prévenu.
      return NextResponse.json({
        error: "aucun_canal_sms",
        message: "La passerelle SMS est hors service et aucun fournisseur n'est configuré. Passez par WhatsApp.",
      }, { status: 503 })
    }
  } else {
    etat = "prepare"
    detail = canal === "whatsapp"
      ? "Message WhatsApp préparé."
      : "SMS préparé sur le téléphone de l'agent."
  }

  await admin.from("client_events").insert({
    agent_client_id: id,
    proposition_id: c.proposition_id ?? null,
    auteur_id: agent.userId,
    type: canal === "whatsapp" ? "whatsapp" : "sms",
    contenu: `${modeleTitre ? `${modeleTitre} — ` : ""}${detail}\n${texte}`,
  } as never)

  return NextResponse.json({
    ok: true, etat, texte, cout,
    lien_whatsapp: `https://wa.me/225${numero}?text=${encodeURIComponent(texte)}`,
    lien_sms: `sms:${numero}?body=${encodeURIComponent(texte)}`,
    site: siteUrl(),
  })
}

async function bienDeLaProposition(
  admin: ReturnType<typeof createAdminClient>, propositionId: string,
): Promise<string | null> {
  const { data } = await admin.from("client_propositions")
    .select("property_id").eq("id", propositionId).maybeSingle()
  return (data as { property_id: string } | null)?.property_id ?? null
}
