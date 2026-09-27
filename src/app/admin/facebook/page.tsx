import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import { resumeSession } from "@/lib/facebook-session"
import ComptesFacebook, { type CompteAffiche } from "./ComptesFacebook"

export const metadata = { title: "Comptes Facebook · Inaya Admin" }
export const dynamic = "force-dynamic"

export default async function AdminFacebookPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/facebook")
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  let comptes: CompteAffiche[] = []
  let migrationManquante = false
  const { data, error } = await createAdminClient().from("facebook_comptes")
    .select("id,nom,cookies,actif,statut,derniere_utilisation,utilisations_jour,jour_compteur,utilisations_total,derniere_erreur,cree_le")
    .order("cree_le", { ascending: true })
  if (error) migrationManquante = error.code === "42P01"
  const jour = new Date().toISOString().slice(0, 10)
  // La SESSION ne quitte jamais le serveur : seul un résumé (« compte …2345 ») est affiché.
  comptes = ((data ?? []) as (Omit<CompteAffiche, "resume" | "aujourdhui"> & { cookies: string; utilisations_jour: number; jour_compteur: string | null })[])
    .map(({ cookies, utilisations_jour, jour_compteur, ...c }) => ({
      ...c, resume: resumeSession(cookies), aujourdhui: jour_compteur === jour ? utilisations_jour : 0,
    }))

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Comptes Facebook</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Comptes dédiés à l&apos;import des publications Facebook. Sans compte, Facebook ne livre que la
          première photo et un extrait du texte ; avec, l&apos;import récupère <b>toutes les photos</b>, le
          texte complet et les publications des groupes privés dont le compte est membre. Les comptes sont
          utilisés <b>à tour de rôle</b> (au plus 40 publications par jour chacun, une par minute au plus) ;
          un compte refusé par Facebook est mis de côté automatiquement et vous êtes prévenu.
        </p>
      </div>
      {migrationManquante ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Appliquez d&apos;abord la migration <code>065_facebook_comptes.sql</code> dans Supabase.
        </div>
      ) : (
        <ComptesFacebook comptes={comptes} />
      )}
    </div>
  )
}
