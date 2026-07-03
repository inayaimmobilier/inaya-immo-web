import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import { formatPrix } from "@/lib/utils"
import { HandCoins } from "lucide-react"
import type { UserRole } from "@/types/database"

export const dynamic = "force-dynamic"

const PILL: Record<string, string> = {
  en_attente: "bg-amber-50 text-amber-700", valide: "bg-blue-50 text-blue-700",
  paye: "bg-green-50 text-green-700", rejete: "bg-red-50 text-red-700",
}

export default async function ApporteurPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/apporteur")
  const admin = createAdminClient()

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  if (role !== "apporteur" && !["super_admin", "admin", "moderateur"].includes(role ?? "")) redirect("/client/profil")

  type Row = { id: string; type: string; montant: number | null; statut: string; created_at: string; properties: { titre: string } | null }
  let rows: Row[] = []
  try {
    const { data } = await admin.from("apports")
      .select("id,type,montant,statut,created_at,properties(titre)")
      .eq("apporteur_id", user.id).order("created_at", { ascending: false }).limit(200)
    rows = (data ?? []) as Row[]
  } catch { /* table absente */ }

  const totalPaye = rows.filter(r => r.statut === "paye").reduce((s, r) => s + (Number(r.montant) || 0), 0)
  const totalAttente = rows.filter(r => r.statut === "en_attente" || r.statut === "valide").reduce((s, r) => s + (Number(r.montant) || 0), 0)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mes apports</h1>
            <p className="text-sm text-gray-500">Suivi de vos commissions d&apos;apport d&apos;affaires</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-lg font-bold text-gray-900">{formatPrix(totalPaye)}</p>
              <p className="text-xs text-gray-500">Commissions payées</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-lg font-bold text-gray-900">{formatPrix(totalAttente)}</p>
              <p className="text-xs text-gray-500">En attente / validées</p>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <HandCoins className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun apport enregistré pour le moment.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {rows.map(a => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.properties?.titre ?? (a.type === "client" ? "Apport client" : "Apport de bien")}</p>
                    <p className="text-xs text-gray-500">{a.created_at.slice(0, 10)} · {a.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{a.montant ? formatPrix(a.montant) : "—"}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${PILL[a.statut] ?? "bg-gray-100 text-gray-600"}`}>{a.statut.replace(/_/g, " ")}</span>
                  </div>
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
