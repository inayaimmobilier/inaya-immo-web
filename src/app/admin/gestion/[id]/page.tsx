import Link from "next/link"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { ArrowLeft, Users, Wallet, Wrench, Banknote } from "lucide-react"
import RecordForms from "./RecordForms"

export const dynamic = "force-dynamic"

interface PageProps { params: Promise<{ id: string }> }

export default async function MandatDetail({ params }: PageProps) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: mandatData, error } = await admin.from("mandats")
    .select("id,type,commission_pct,proprietaire_id,property_id,date_debut,notes,profiles:proprietaire_id(nom,prenom,telephone),properties(id,titre,quartier,ville)")
    .eq("id", id).single()
  if (error && (error.code === "PGRST205" || error.code === "42P01")) notFound()
  const m = mandatData as {
    id: string; type: string; commission_pct: number | null; proprietaire_id: string; property_id: string | null; date_debut: string | null; notes: string | null
    profiles: { nom: string | null; prenom: string | null; telephone: string | null } | null
    properties: { id: string; titre: string; quartier: string | null; ville: string | null } | null
  } | null
  if (!m) notFound()

  const [{ data: locs }, { data: encs }, { data: trav }, { data: vers }, { data: prest }] = await Promise.all([
    admin.from("locataires").select("id,nom,telephone,loyer_mensuel,date_entree,statut").eq("mandat_id", id).order("created_at", { ascending: false }),
    admin.from("encaissements").select("id,periode,montant,mode,statut,date_encaissement").eq("mandat_id", id).order("date_encaissement", { ascending: false }),
    admin.from("travaux").select("id,titre,cout,statut,date_demande").eq("mandat_id", id).order("date_demande", { ascending: false }),
    admin.from("versements").select("id,periode,montant_net,statut,date_versement").eq("mandat_id", id).order("created_at", { ascending: false }),
    admin.from("profiles").select("id,nom,prenom").eq("role", "prestataire"),
  ])

  const locataires = (locs ?? []) as { id: string; nom: string | null; telephone: string | null; loyer_mensuel: number | null; date_entree: string | null; statut: string }[]
  const encaissements = (encs ?? []) as { id: string; periode: string | null; montant: number; mode: string | null; statut: string; date_encaissement: string | null }[]
  const travaux = (trav ?? []) as { id: string; titre: string; cout: number | null; statut: string; date_demande: string | null }[]
  const versements = (vers ?? []) as { id: string; periode: string | null; montant_net: number; statut: string; date_versement: string | null }[]
  const prestataires = (prest ?? []) as { id: string; nom: string | null; prenom: string | null }[]

  const owner = `${m.profiles?.prenom ?? ""} ${m.profiles?.nom ?? ""}`.trim() || "Propriétaire"
  const ctx = { mandatId: m.id, propertyId: m.property_id, proprietaireId: m.proprietaire_id }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/gestion" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux mandats
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{m.properties?.titre ?? "Bien non lié"}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {owner}{m.profiles?.telephone ? ` · ${m.profiles.telephone}` : ""} · {m.type.replace(/_/g, " ")}{m.commission_pct ? ` · commission ${m.commission_pct}%` : ""}
        </p>
      </div>

      {/* LOCATAIRES */}
      <Section icon={Users} title="Locataires" count={locataires.length}>
        {locataires.map(l => (
          <Row key={l.id} main={l.nom ?? "Locataire"} sub={`${l.telephone ?? "—"}${l.date_entree ? ` · depuis ${l.date_entree}` : ""}`}
            right={l.loyer_mensuel ? `${formatPrix(l.loyer_mensuel)}/mois` : "—"} tag={l.statut} />
        ))}
        <RecordForms kind="locataire" ctx={ctx} />
      </Section>

      {/* ENCAISSEMENTS */}
      <Section icon={Wallet} title="Encaissements" count={encaissements.length}>
        {encaissements.map(e => (
          <Row key={e.id} main={e.periode ?? "Période —"} sub={`${e.mode ?? "—"}${e.date_encaissement ? ` · ${e.date_encaissement}` : ""}`}
            right={formatPrix(e.montant)} tag={e.statut} />
        ))}
        <RecordForms kind="encaissement" ctx={ctx} locataires={locataires} />
      </Section>

      {/* TRAVAUX */}
      <Section icon={Wrench} title="Travaux" count={travaux.length}>
        {travaux.map(t => (
          <Row key={t.id} main={t.titre} sub={t.date_demande?.slice(0, 10) ?? ""} right={t.cout ? formatPrix(t.cout) : "—"} tag={t.statut} />
        ))}
        <RecordForms kind="travaux" ctx={ctx} prestataires={prestataires} />
      </Section>

      {/* VERSEMENTS */}
      <Section icon={Banknote} title="Versements au propriétaire" count={versements.length}>
        {versements.map(v => (
          <Row key={v.id} main={v.periode ?? "Période —"} sub={v.date_versement ?? ""} right={formatPrix(v.montant_net)} tag={v.statut} />
        ))}
        <RecordForms kind="versement" ctx={ctx} />
      </Section>
    </div>
  )
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Users; title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">({count})</span>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </section>
  )
}

function Row({ main, sub, right, tag }: { main: string; sub: string; right: string; tag: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{main}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-gray-900">{right}</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tag}</span>
      </div>
    </div>
  )
}
