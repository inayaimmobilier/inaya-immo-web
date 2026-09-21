import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, refus } from "@/lib/agent-mobile"
import { analyser, cleTelephone, type LigneImport } from "@/lib/import-agent"

// ============================================================================
// IMPORTER UN FICHIER DE CLIENTS.
//
// ── DEUX TEMPS, TOUJOURS ───────────────────────────────────────────────────
//
// Le premier appel ANALYSE et ne touche à rien : il renvoie ce qui entrerait,
// ce qui est déjà là, et ce qui a été refusé avec la raison. Le second
// enregistre. Un import qui écrirait d'emblée obligerait à réparer à la main
// un carnet pollué par une colonne mal reconnue.
//
// Les doublons ne sont pas des erreurs : un agent réimporte volontiers le même
// fichier pour rattraper trois lignes ajoutées depuis. On les compte, on ne
// les réécrit pas — sa fiche contient peut-être des notes que le fichier n'a
// pas.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PLAFOND = 1000

export async function POST(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  let c: { nom_fichier?: string; contenu_base64?: string; confirmer?: boolean }
  try { c = await req.json() } catch { return NextResponse.json({ error: "requete_invalide" }, { status: 400 }) }

  if (!c.contenu_base64) return NextResponse.json({ error: "fichier_manquant" }, { status: 400 })

  let contenu: Buffer
  try { contenu = Buffer.from(c.contenu_base64, "base64") } catch {
    return NextResponse.json({ error: "fichier_illisible" }, { status: 400 })
  }
  if (contenu.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "fichier_trop_gros", message: "8 Mo maximum." }, { status: 413 })
  }

  const analyse = analyser(c.nom_fichier ?? "import", contenu)

  if (!analyse.lignes.length) {
    return NextResponse.json({
      format: analyse.format,
      nouveaux: [], doublons: [], rejets: analyse.rejets,
      message: "Aucun client exploitable dans ce fichier.",
    })
  }

  // Ce que l'agent a déjà, pour ne pas le réécrire. Une seule requête : lire
  // un carnet ligne à ligne sur mille lignes, c'est mille allers-retours.
  const admin = createAdminClient()
  const { data } = await admin.from("agent_clients")
    .select("id,nom,telephone_norm").eq("agent_id", agent.userId)
  const connus = new Map<string, { id: string; nom: string }>()
  for (const x of (data ?? []) as { id: string; nom: string; telephone_norm: string }[]) {
    if (x.telephone_norm) connus.set(x.telephone_norm, { id: x.id, nom: x.nom })
  }

  const nouveaux: LigneImport[] = []
  const doublons: { nom: string; telephone: string; deja: string }[] = []
  // Un même numéro deux fois DANS le fichier : la deuxième ligne n'est pas un
  // nouveau client.
  const vusDansLeFichier = new Set<string>()

  for (const l of analyse.lignes) {
    const cle = cleTelephone(l.telephone)
    const deja = connus.get(cle)
    if (deja) { doublons.push({ nom: l.nom, telephone: l.telephone, deja: deja.nom }); continue }
    if (vusDansLeFichier.has(cle)) {
      doublons.push({ nom: l.nom, telephone: l.telephone, deja: "en double dans le fichier" })
      continue
    }
    vusDansLeFichier.add(cle)
    nouveaux.push(l)
  }

  if (nouveaux.length > PLAFOND) {
    return NextResponse.json({
      error: "trop_de_lignes",
      message: `${nouveaux.length} clients : au-delà de ${PLAFOND}, découpez le fichier.`,
    }, { status: 413 })
  }

  // ── Premier temps : on montre, on n'écrit pas ───────────────────────────
  if (!c.confirmer) {
    return NextResponse.json({
      format: analyse.format,
      nouveaux: nouveaux.slice(0, 50),
      total_nouveaux: nouveaux.length,
      doublons: doublons.slice(0, 50),
      total_doublons: doublons.length,
      rejets: analyse.rejets.slice(0, 50),
      total_rejets: analyse.rejets.length,
    })
  }

  // ── Second temps : on enregistre ────────────────────────────────────────
  if (!nouveaux.length) {
    return NextResponse.json({ ok: true, crees: 0, doublons: doublons.length, rejets: analyse.rejets.length })
  }

  const { data: inseres, error } = await admin.from("agent_clients").insert(
    nouveaux.map(l => ({
      agent_id: agent.userId,
      nom: l.nom,
      telephone: l.telephone,
      telephone_2: l.telephone_2 ?? null,
      email: l.email ?? null,
      quartier: l.quartier ?? null,
      ville: l.ville ?? "Bouaké",
      profession: l.profession ?? null,
      canal: "autre",
      source_detail: `Importé depuis un fichier ${analyse.format}`,
      notes: l.notes ?? null,
    })) as never,
  ).select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (inseres ?? []) as { id: string }[]
  if (ids.length) {
    await admin.from("client_events").insert(
      ids.map(x => ({
        agent_client_id: x.id, auteur_id: agent.userId, type: "note",
        contenu: `Client importé depuis un fichier ${analyse.format}.`,
      })) as never,
    )
  }

  return NextResponse.json({
    ok: true,
    crees: ids.length,
    doublons: doublons.length,
    rejets: analyse.rejets.length,
  })
}
