import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agentDepuisEntete, estAdministration, refus } from "@/lib/agent-mobile"
import {
  versCsv, versJson, versTexte, versVCard, versXlsx,
  type ClientExport,
} from "@/lib/export-agent"
import { tableauPdf } from "@/lib/pdf-simple"

// ============================================================================
// EXPORTER SON CARNET.
//
// Le fichier est fabriqué ICI, pas sur le téléphone : les données y sont déjà,
// et embarquer un moteur de tableur dans l'APK l'alourdirait pour une action
// qu'on fait une fois par mois. L'application télécharge et partage.
//
// Par défaut, SES clients. L'administration peut demander tout le carnet de
// l'agence — c'est la seule différence.
// ============================================================================
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const FORMATS = ["json", "csv", "xlsx", "texte", "vcard", "pdf"] as const
type Format = (typeof FORMATS)[number]

const COLONNES_BASE =
  "nom,telephone,telephone_2,email,quartier,ville,profession,canal,statut," +
  "relance_le,notes,date_naissance,created_at," +
  "propositions_total,propositions_conclues,requetes_actives"

export async function GET(req: NextRequest) {
  const agent = await agentDepuisEntete(req.headers.get("authorization"))
  if (!agent) return refus("non_authentifie")

  const p = req.nextUrl.searchParams
  const format = (FORMATS.includes(p.get("format") as Format) ? p.get("format") : "json") as Format
  const toutLeMonde = p.get("vue") === "tous" && estAdministration(agent.role)
  const statut = p.get("statut") ?? ""

  const admin = createAdminClient()
  let requete = admin.from("agent_clients_resume").select(COLONNES_BASE)
  if (!toutLeMonde) requete = requete.eq("agent_id", agent.userId)
  if (statut) requete = requete.eq("statut", statut)

  const { data, error } = await requete.order("nom")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clients = (data ?? []) as unknown as ClientExport[]
  if (!clients.length) {
    return NextResponse.json({ error: "carnet_vide" }, { status: 404 })
  }

  const jour = new Date().toISOString().slice(0, 10)
  const nomAgent = agent.nom ?? "Agent"
  const base = `clients-inaya-${jour}`

  let corps: Buffer
  let type: string
  let extension: string

  switch (format) {
    case "csv":
      corps = Buffer.from(versCsv(clients), "utf8")
      type = "text/csv; charset=utf-8"; extension = "csv"
      break
    case "xlsx":
      corps = versXlsx(clients)
      type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      extension = "xlsx"
      break
    case "texte":
      corps = Buffer.from(versTexte(clients, nomAgent), "utf8")
      type = "text/plain; charset=utf-8"; extension = "txt"
      break
    case "vcard":
      corps = Buffer.from(versVCard(clients), "utf8")
      type = "text/vcard; charset=utf-8"; extension = "vcf"
      break
    case "pdf":
      corps = tableauPdf({
        titre: "Carnet de clients — Inaya Immo",
        sousTitre: `${nomAgent} · ${clients.length} client${clients.length > 1 ? "s" : ""} · édité le ${
          new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}`,
        // Les largeurs sont choisies pour qu'un A4 tienne sans rogner le nom
        // ni le numéro, qui sont les deux seules colonnes indispensables.
        colonnes: [
          { titre: "Nom et prénoms", largeur: 150, cle: "nom" },
          { titre: "Téléphone", largeur: 78, cle: "telephone" },
          { titre: "Lieu", largeur: 95, cle: "lieu" },
          { titre: "Dossier", largeur: 62, cle: "statut" },
          { titre: "Rappel", largeur: 60, cle: "relance_le" },
          { titre: "Biens", largeur: 38, cle: "biens" },
          { titre: "Conclus", largeur: 32, cle: "conclus" },
        ],
        lignes: clients.map(c => ({
          nom: c.nom,
          telephone: c.telephone,
          lieu: [c.ville, c.quartier].filter(Boolean).join(" · "),
          statut: c.statut,
          relance_le: c.relance_le ?? "",
          biens: String(c.propositions_total ?? 0),
          conclus: String(c.propositions_conclues ?? 0),
        })),
        piedDePage: "Document interne Inaya Immo — ne pas diffuser.",
      })
      type = "application/pdf"; extension = "pdf"
      break
    default:
      corps = Buffer.from(versJson(clients), "utf8")
      type = "application/json; charset=utf-8"; extension = "json"
  }

  return new NextResponse(new Uint8Array(corps), {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${base}.${extension}"`,
      "content-length": String(corps.length),
      // Un carnet de clients n'a rien à faire dans un cache partagé.
      "cache-control": "no-store, private",
    },
  })
}
