import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import { formatPrix } from "@/lib/utils"
import { Wrench } from "lucide-react"
import TravauxStatus from "./TravauxStatus"
import type { UserRole } from "@/types/database"

export const dynamic = "force-dynamic"

export default async function PrestatairePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/prestataire")
  const admin = createAdminClient()

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  if (role !== "prestataire" && !["super_admin", "admin", "moderateur"].includes(role ?? "")) redirect("/client/profil")

  type Row = { id: string; titre: string; description: string | null; cout: number | null; statut: string; date_demande: string | null; properties: { titre: string; quartier: string | null } | null }
  let rows: Row[] = []
  try {
    const { data } = await admin.from("travaux")
      .select("id,titre,description,cout,statut,date_demande,properties(titre,quartier)")
      .eq("prestataire_id", user.id).order("date_demande", { ascending: false }).limit(200)
    rows = (data ?? []) as Row[]
  } catch { /* table absente */ }

  const actifs = rows.filter(r => r.statut !== "termine" && r.statut !== "annule")

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mes interventions</h1>
            <p className="text-sm text-gray-500">{actifs.length} en cours · {rows.length} au total</p>
          </div>
          {rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Wrench className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucune intervention ne vous est assignée pour le moment.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(t => (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">{t.titre}</p>
                    {t.cout != null && <span className="text-sm text-gray-700 shrink-0">{formatPrix(t.cout)}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{[t.properties?.titre, t.properties?.quartier].filter(Boolean).join(" · ")}</p>
                  {t.description && <p className="text-xs text-gray-600 mt-1">{t.description}</p>}
                  <div className="mt-2"><TravauxStatus id={t.id} statut={t.statut} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs mt-8">© {new Date().getFullYear()} Inaya Immo · <Link href="/" className="hover:text-white">Accueil</Link></footer>
      </main>
    </>
  )
}
