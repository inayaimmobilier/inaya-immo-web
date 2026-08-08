import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { userIdFromAuthHeader } from "@/lib/mobile-session"
import { notifyStaff } from "@/lib/notifications"
import { ipDe, limiteAtteinte, TROP_DE_TENTATIVES } from "@/lib/rate-limit"

// ============================================================================
// DEMANDE D'OUVERTURE D'UN COMPTE PROFESSIONNEL.
//
// Elle passait par WhatsApp : elle n'existait donc nulle part, arrivait dans
// une conversation parmi d'autres, et obligeait l'administrateur à recopier à
// la main des informations qu'il n'avait pas sous une forme exploitable. Un
// candidat oublié dans un fil de discussion est un client perdu.
//
//   GET  → l'état de MA demande, pour que l'écran sache quoi afficher
//   POST → dépose une demande, et alerte le staff
// ============================================================================
export const runtime = "nodejs"

interface Ligne {
  id: string; statut: string; decision_note: string | null; created_at: string
}

export async function GET(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 })

  const { data } = await createAdminClient().from("demandes_pro")
    .select("id, statut, decision_note, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({ demande: (data as unknown as Ligne | null) ?? null })
}

export async function POST(req: NextRequest) {
  const userId = userIdFromAuthHeader(req.headers.get("authorization"))
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 })

  // Une demande est traitée par un humain : une rafale ne ferait qu'encombrer
  // la file de quelqu'un qui a d'autres candidats à examiner.
  if (limiteAtteinte(`demandepro:${userId}`, 3, 24 * 60 * 60_000) ||
      limiteAtteinte(`demandepro:ip:${ipDe(req)}`, 10, 24 * 60 * 60_000)) {
    return NextResponse.json({ error: TROP_DE_TENTATIVES }, { status: 429 })
  }

  let body: Record<string, string>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }) }

  const texte = (k: string, max: number) => String(body[k] ?? "").trim().slice(0, max)
  const nom = texte("nom_contact", 120)
  const tel = texte("telephone", 30)
  const activite = texte("activite", 500)

  // Trois champs seulement sont exigés. Un formulaire long fait renoncer ceux
  // qu'on veut justement recruter ; l'administrateur peut toujours demander
  // le reste avant de valider.
  if (nom.length < 3) return NextResponse.json({ error: "Indiquez votre nom." }, { status: 400 })
  if (tel.replace(/\D/g, "").length < 8) return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 })
  if (activite.length < 5) return NextResponse.json({ error: "Décrivez votre activité en quelques mots." }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("demandes_pro").insert({
    user_id: userId,
    nom_contact: nom,
    telephone: tel,
    agence: texte("agence", 160) || null,
    registre: texte("registre", 80) || null,
    ville: texte("ville", 80) || null,
    activite,
    message: texte("message", 800) || null,
  } as never)

  if (error) {
    // 23505 = l'index d'unicité sur les demandes en attente. Ce n'est pas une
    // panne, c'est la règle : on le dit sans alarmer.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Votre demande est déjà en cours d'examen." }, { status: 409 })
    }
    console.error("INAYA-PRO-001", error)
    return NextResponse.json({ error: "Envoi impossible pour le moment." }, { status: 500 })
  }

  // Le staff est prévenu tout de suite : une demande qui dort une semaine vaut
  // à peine mieux qu'une demande perdue.
  try {
    await notifyStaff({
      type: "demande_pro",
      titre: "Demande de compte professionnel",
      contenu: `${nom}${body.agence ? ` — ${String(body.agence).slice(0, 60)}` : ""} (${tel}) : ${activite.slice(0, 160)}`,
      payload: { user_id: userId },
    })
  } catch (e) {
    console.error("INAYA-PRO-002", e)
  }

  return NextResponse.json({ ok: true })
}
