import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import ProprioNav from "./ProprioNav"
import type { UserRole } from "@/types/database"

export const dynamic = "force-dynamic"

export default async function ProprietaireLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/proprietaire")

  // Rôle + sous-type (résilient si la migration 032 n'est pas appliquée).
  let role: UserRole = "client"
  let proprioType: "diffuseur" | "gere" = "diffuseur"
  let nom = user.email ?? "Mon compte"
  {
    const { data, error } = await supabase
      .from("profiles").select("role, nom, prenom, proprietaire_type").eq("id", user.id).single()
    if (error?.code === "42703") {
      const { data: d2 } = await supabase.from("profiles").select("role, nom, prenom").eq("id", user.id).single()
      const p = d2 as { role: UserRole; nom: string | null; prenom: string | null } | null
      if (p) { role = p.role; nom = `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || nom }
    } else if (data) {
      const p = data as { role: UserRole; nom: string | null; prenom: string | null; proprietaire_type: string | null }
      role = p.role
      proprioType = p.proprietaire_type === "gere" ? "gere" : "diffuseur"
      nom = `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || nom
    }
  }

  // Réservé aux propriétaires (et au staff pour consultation).
  const STAFF: UserRole[] = ["super_admin", "admin", "moderateur", "agent", "comptable"]
  if (role !== "proprietaire" && !STAFF.includes(role)) redirect("/client/profil")

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Espace propriétaire</h1>
              <p className="text-sm text-gray-500">
                {nom.split(" ")[0]} ·{" "}
                <span className="font-medium">{proprioType === "gere" ? "Biens gérés par Inaya" : "Diffusion de mes biens"}</span>
              </p>
            </div>
          </div>
          <ProprioNav managed={proprioType === "gere"} />
          <div className="mt-5">{children}</div>
        </div>
        <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs mt-8">
          © {new Date().getFullYear()} Inaya Immo · <Link href="/" className="hover:text-white">Accueil</Link>
        </footer>
      </main>
    </>
  )
}
