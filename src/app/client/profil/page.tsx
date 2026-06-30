import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { updateProfile } from "../actions"

export const metadata = { title: "Profil · Inaya Immo" }

interface PageProps { searchParams: Promise<{ ok?: string; error?: string }> }

async function save(form: FormData) {
  "use server"
  const res = await updateProfile(form)
  redirect(res.ok ? "/client/profil?ok=1" : `/client/profil?error=${encodeURIComponent(res.error)}`)
}

export default async function ProfilPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase.from("profiles").select("nom,prenom,telephone").eq("id", user!.id).single()
  const profile = data as { nom: string | null; prenom: string | null; telephone: string | null } | null

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
  const label = "block text-xs font-medium text-gray-600 mb-1.5"

  return (
    <div className="max-w-lg space-y-4">
      {params.ok && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">Profil mis à jour.</div>}
      {params.error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{params.error}</div>}

      <form action={save} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Mes informations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Prénom</label>
            <input name="prenom" defaultValue={profile?.prenom ?? ""} className={field} />
          </div>
          <div>
            <label className={label}>Nom</label>
            <input name="nom" defaultValue={profile?.nom ?? ""} className={field} />
          </div>
        </div>
        <div>
          <label className={label}>Téléphone (WhatsApp)</label>
          <input name="telephone" type="tel" defaultValue={profile?.telephone ?? ""} className={field} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input value={user!.email ?? ""} disabled className={`${field} text-gray-400`} />
          <p className="text-[11px] text-gray-400 mt-1">L&apos;email ne peut pas être modifié ici.</p>
        </div>
        <button type="submit" className="bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors">
          Enregistrer
        </button>
      </form>

      <form action="/api/auth/signout" method="post">
        <button type="submit" className="text-sm text-red-600 hover:text-red-700 font-medium">Se déconnecter</button>
      </form>
    </div>
  )
}
