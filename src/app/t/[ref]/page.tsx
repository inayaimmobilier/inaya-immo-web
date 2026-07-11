import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Home, User } from "lucide-react"
import TaskActions from "./TaskActions"

export const metadata = { title: "Suivi de tâche · Inaya Immo", robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function TaskPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const refCode = String(ref).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)
  const admin = createAdminClient()

  const { data: fu } = await admin.from("lead_followups")
    .select("lead_id").eq("ref", refCode).order("envoye_le", { ascending: false }).limit(1).maybeSingle()
  const leadId = (fu as { lead_id: string } | null)?.lead_id ?? null

  let lead: { statut: string; contact_nom: string | null; prop: string | null; quartier: string | null } | null = null
  if (leadId) {
    const { data } = await admin.from("leads")
      .select("statut, contact_nom, properties(titre, quartier)").eq("id", leadId).single()
    const l = data as { statut: string; contact_nom: string | null; properties: { titre: string; quartier: string | null } | { titre: string; quartier: string | null }[] | null } | null
    if (l) {
      const p = Array.isArray(l.properties) ? l.properties[0] : l.properties
      lead = { statut: l.statut, contact_nom: l.contact_nom, prop: p?.titre ?? null, quartier: p?.quartier ?? null }
    }
  }

  const closed = lead && ["conclu", "abandonne"].includes(lead.statut)

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <Link href="/" aria-label="Accueil Inaya">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-11 h-11 rounded-2xl mb-2" />
          </Link>
          <h1 className="text-base font-bold"><span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span> — Tâche R{refCode}</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {!lead ? (
            <p className="text-sm text-gray-500 text-center">Tâche introuvable ou déjà clôturée.</p>
          ) : (
            <>
              <div className="mb-4 pb-4 border-b border-gray-100 space-y-1">
                {lead.prop && <p className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Home className="w-4 h-4 text-blue-600" /> {lead.prop}{lead.quartier ? ` · ${lead.quartier}` : ""}</p>}
                {lead.contact_nom && <p className="text-xs text-gray-500 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Client : {lead.contact_nom}</p>}
              </div>
              {closed ? (
                <p className="text-sm text-gray-500 text-center">Cette tâche est déjà clôturée ({lead.statut === "conclu" ? "conclue" : "abandonnée"}). Merci !</p>
              ) : (
                <TaskActions refCode={refCode} />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
