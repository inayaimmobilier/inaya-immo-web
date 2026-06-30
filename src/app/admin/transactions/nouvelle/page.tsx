import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { createTransactionAndRedirect } from "../actions"
import type { UserRole, PropertyType } from "@/types/database"

export const metadata = { title: "Nouvelle transaction · Inaya Immo" }

interface PageProps { searchParams: Promise<{ error?: string }> }

interface PropOpt { id: string; titre: string; type_offre: PropertyType; prix: number; quartier: string | null }
interface AgentOpt { id: string; nom: string | null; prenom: string | null }

export default async function NouvelleTransactionPage({ searchParams }: PageProps) {
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/transactions/nouvelle")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const [{ data: propsData }, { data: agentsData }] = await Promise.all([
    supabase.from("properties")
      .select("id,titre,type_offre,prix,quartier")
      .in("statut", ["publie", "reserve", "conclu"])
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles")
      .select("id,nom,prenom").in("role", ["agent", "admin", "super_admin"]).limit(200),
  ])
  const properties = (propsData ?? []) as PropOpt[]
  const agents = (agentsData ?? []) as AgentOpt[]

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
  const label = "block text-xs font-medium text-gray-600 mb-1.5"

  return (
    <div className="p-6 space-y-6">
      <div>
        <a href="/admin/transactions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux transactions
        </a>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle transaction</h1>
        <p className="text-sm text-gray-500 mt-1">La commission est calculée automatiquement selon les règles en vigueur.</p>
      </div>

      <form action={createTransactionAndRedirect} className="space-y-5 max-w-2xl">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className={label}>Bien concerné *</label>
            <select name="property_id" required className={field} defaultValue="">
              <option value="" disabled>Sélectionner un bien…</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.titre} · {p.type_offre === "location" ? "Location" : "Vente"} · {formatPrix(p.prix)}{p.quartier ? ` · ${p.quartier}` : ""}
                </option>
              ))}
            </select>
            {properties.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">Aucun bien publié/réservé disponible.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Montant de la transaction (XOF) *</label>
              <input type="number" name="montant_transaction" required min="1" className={field}
                placeholder="Prix de vente ou loyer mensuel" />
              <p className="text-[11px] text-gray-400 mt-1">En location, saisir le loyer mensuel (base de calcul).</p>
            </div>
            <div>
              <label className={label}>Mode de paiement</label>
              <select name="mode_paiement" className={field} defaultValue="">
                <option value="">Non défini</option>
                <option value="liquide">Liquide</option>
                <option value="mobile_money_direct">Mobile Money (direct)</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Agent immobilier</label>
            <select name="agent_id" className={field} defaultValue="">
              <option value="">Aucun</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{`${a.prenom ?? ""} ${a.nom ?? ""}`.trim() || a.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>Note interne</label>
            <textarea name="note_admin" rows={2} className={field} placeholder="Optionnel" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
            Créer la transaction
          </button>
          <a href="/admin/transactions" className="text-sm text-gray-500 hover:text-gray-700">Annuler</a>
        </div>
      </form>
    </div>
  )
}
