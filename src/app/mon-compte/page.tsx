import { redirect } from "next/navigation"
import Link from "next/link"
import Navbar from "@/components/shared/Navbar"
import { createClient } from "@/lib/supabase/server"
import { isRealEmail } from "@/lib/account-actions"
import { ROLE_LABEL } from "@/lib/utils"
import { ArrowLeft, User } from "lucide-react"
import type { UserRole } from "@/types/database"
import PasswordForm from "./PasswordForm"

export const metadata = { title: "Mon compte · Inaya Immo" }

export default async function MonComptePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/mon-compte")

  const { data: prof } = await supabase.from("profiles").select("nom, prenom, telephone, role").eq("id", user.id).maybeSingle()
  const p = prof as { nom: string | null; prenom: string | null; telephone: string | null; role: UserRole } | null
  const nomComplet = `${p?.prenom || ""} ${p?.nom || ""}`.trim() || "Utilisateur"
  const email = (await isRealEmail(user.email)) ? user.email : null

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-5">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700">
            <ArrowLeft className="w-4 h-4" /> Retour à l&apos;accueil
          </Link>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gérez vos informations et votre mot de passe.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{nomComplet}</p>
                <p className="text-xs text-gray-500">{p?.role ? ROLE_LABEL[p.role] ?? p.role : ""}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Téléphone</p>
                <p className="text-gray-800">{p?.telephone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">E-mail</p>
                <p className="text-gray-800">{email || "—"}</p>
              </div>
            </div>
          </div>

          <PasswordForm />
        </div>
      </main>
    </>
  )
}
