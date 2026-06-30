import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import Navbar from "@/components/shared/Navbar"
import ClientNav from "./ClientNav"

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/client/mes-requetes")

  const { data } = await supabase.from("profiles").select("nom, prenom").eq("id", user.id).single()
  const profile = data as { nom: string | null; prenom: string | null } | null
  const nom = `${profile?.prenom ?? ""} ${profile?.nom ?? ""}`.trim() || user.email || "Mon compte"

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-gray-900">Bonjour, {nom.split(" ")[0]}</h1>
            <p className="text-sm text-gray-500">Votre espace personnel Inaya</p>
          </div>
          <ClientNav />
          <div className="mt-5">{children}</div>
        </div>
        <footer className="bg-gray-900 text-gray-400 text-center py-6 text-xs mt-8">
          © {new Date().getFullYear()} Inaya Immo · <Link href="/" className="hover:text-white">Accueil</Link>
        </footer>
      </main>
    </>
  )
}
