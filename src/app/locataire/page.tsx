import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import { formatPrix } from "@/lib/utils"
import { Home, Wallet } from "lucide-react"
import RepairRequest from "./RepairRequest"
import type { UserRole } from "@/types/database"

export const dynamic = "force-dynamic"

export default async function LocatairePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/locataire")
  const admin = createAdminClient()

  // Bail(s) du locataire (résilient).
  type Bail = { id: string; property_id: string | null; proprietaire_id: string | null; loyer_mensuel: number | null; caution: number | null; date_entree: string | null; statut: string; properties: { titre: string; quartier: string | null; ville: string | null } | null }
  let baux: Bail[] = []
  try {
    const { data } = await admin.from("locataires")
      .select("id,property_id,proprietaire_id,loyer_mensuel,caution,date_entree,statut,properties(titre,quartier,ville)")
      .eq("user_id", user.id).order("created_at", { ascending: false })
    baux = (data ?? []) as Bail[]
  } catch { /* table absente */ }

  // Historique des paiements du locataire.
  let paiements: { id: string; periode: string | null; montant: number; statut: string; date_encaissement: string | null }[] = []
  if (baux.length) {
    try {
      const { data } = await admin.from("encaissements")
        .select("id,periode,montant,statut,date_encaissement")
        .in("locataire_id", baux.map(b => b.id)).order("date_encaissement", { ascending: false }).limit(50)
      paiements = (data ?? []) as typeof paiements
    } catch { /* ignore */ }
  }

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  const isTenant = role === "locataire" || ["super_admin", "admin", "moderateur"].includes(role ?? "")
  if (!isTenant && baux.length === 0) redirect("/client/profil")

  const bail = baux[0] ?? null

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mon espace locataire</h1>
            <p className="text-sm text-gray-500">Votre bail, vos paiements et vos demandes</p>
          </div>

          {!bail ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Home className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun bail n&apos;est encore rattaché à votre compte. Contactez Inaya pour la mise en relation.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2"><Home className="w-4 h-4 text-blue-600" /> Mon logement</h2>
                <p className="text-base font-medium text-gray-900">{bail.properties?.titre ?? "Logement"}</p>
                <p className="text-sm text-gray-500">{[bail.properties?.quartier, bail.properties?.ville].filter(Boolean).join(", ")}</p>
                <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                  <div><span className="text-gray-500">Loyer</span><p className="font-semibold text-gray-900">{bail.loyer_mensuel ? `${formatPrix(bail.loyer_mensuel)}/mois` : "—"}</p></div>
                  <div><span className="text-gray-500">Depuis</span><p className="font-semibold text-gray-900">{bail.date_entree ?? "—"}</p></div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Mes paiements</h2>
                </div>
                {paiements.length === 0 ? (
                  <p className="text-sm text-gray-400 px-5 py-6 text-center">Aucun paiement enregistré.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {paiements.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-5 py-3">
                        <div><p className="text-sm font-medium text-gray-900">{p.periode ?? "—"}</p><p className="text-xs text-gray-500">{p.date_encaissement ?? ""}</p></div>
                        <div className="text-right"><p className="text-sm font-semibold text-gray-900">{formatPrix(p.montant)}</p><span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.statut}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <RepairRequest propertyId={bail.property_id} proprietaireId={bail.proprietaire_id} />
            </>
          )}
        </div>
        <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs mt-8">© {new Date().getFullYear()} Inaya Immo · <Link href="/" className="hover:text-white">Accueil</Link></footer>
      </main>
    </>
  )
}
