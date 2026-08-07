import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { resoudreTache } from "@/lib/garde-tache"
import { Home, User } from "lucide-react"
import ConfirmTask from "./ConfirmTask"

export const metadata = { title: "Confirmer la tâche · Inaya Immo", robots: { index: false } }
export const dynamic = "force-dynamic"

/**
 * Page ouverte par le bouton « Confirmer » du message WhatsApp d'assignation.
 * Identifiée par la référence courte de la tâche (jeton), comme /t/{ref}.
 */
export default async function ConfirmTaskPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  // `jeton` est le paramètre BRUT, signature comprise : c'est lui qu'on
  // retransmet au composant client, car l'action vérifie la signature. Ne
  // passer que les quatre caractères reviendrait à rejeter chaque clic.
  const jeton = String(ref)
  const t = await resoudreTache(jeton)
  const refCode = t.ok ? t.ref : ""
  const leadId = t.ok ? t.leadId : null
  const admin = createAdminClient()


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

  const closed = !!lead && ["conclu", "abandonne"].includes(lead.statut)

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <Link href="/" aria-label="Accueil Inaya">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-11 h-11 rounded-2xl mb-2" />
          </Link>
          <h1 className="text-base font-bold">
            <span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span> — Tâche {refCode}
          </h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          {!lead ? (
            <p className="text-sm text-gray-500 text-center">Tâche introuvable ou expirée.</p>
          ) : (
            <>
              <div className="space-y-1.5 text-sm">
                {lead.prop && (
                  <p className="flex items-start gap-2 text-gray-800">
                    <Home className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span className="font-medium">{lead.prop}{lead.quartier ? ` · ${lead.quartier}` : ""}</span>
                  </p>
                )}
                {lead.contact_nom && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <User className="w-4 h-4 text-gray-400 shrink-0" /> Client : {lead.contact_nom}
                  </p>
                )}
              </div>
              <ConfirmTask refCode={jeton} closed={closed} />
            </>
          )}
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4">
          Coordonnées du propriétaire gérées par l&apos;administration Inaya.
        </p>
      </div>
    </main>
  )
}
