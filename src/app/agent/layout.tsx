import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import AgentNav from "./AgentNav"
import type { UserRole } from "@/types/database"

export const dynamic = "force-dynamic"

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/agent")

  let role: UserRole = "client"
  let nom = user.email ?? "Mon compte"
  let agence: string | null = null
  {
    const { data, error } = await supabase
      .from("profiles").select("role, nom, prenom, agence").eq("id", user.id).single()
    if (error?.code === "42703") {
      const { data: d2 } = await supabase.from("profiles").select("role, nom, prenom").eq("id", user.id).single()
      const p = d2 as { role: UserRole; nom: string | null; prenom: string | null } | null
      if (p) { role = p.role; nom = `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || nom }
    } else if (data) {
      const p = data as { role: UserRole; nom: string | null; prenom: string | null; agence: string | null }
      role = p.role
      nom = `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || nom
      agence = p.agence
    }
  }

  // Réservé aux agents (et au staff pour consultation).
  const STAFF: UserRole[] = ["super_admin", "admin", "moderateur"]
  if (role !== "agent" && !STAFF.includes(role)) redirect("/client/profil")

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Espace agent immobilier</h1>
              <p className="text-sm text-gray-500">
                {nom.split(" ")[0]}{agence ? <> · <span className="font-medium">{agence}</span></> : null}
              </p>
            </div>
          </div>
          <AgentNav />
          <div className="mt-5">{children}</div>
        </div>
        <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs mt-8">
          © {new Date().getFullYear()} Inaya Immo · <Link href="/" className="hover:text-white">Accueil</Link>
        </footer>
      </main>
    </>
  )
}
