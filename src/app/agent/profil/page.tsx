import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { updateMyAgentProfile } from "./actions"

export const metadata = { title: "Mon profil · Inaya Immo" }

interface PageProps { searchParams: Promise<{ ok?: string; error?: string }> }

async function save(form: FormData) {
  "use server"
  const res = await updateMyAgentProfile({
    nom: String(form.get("nom") || ""),
    prenom: String(form.get("prenom") || ""),
    telephone: String(form.get("telephone") || ""),
    agence: String(form.get("agence") || ""),
    agenceAdresse: String(form.get("agence_adresse") || ""),
  })
  redirect(res.ok ? "/agent/profil?ok=1" : `/agent/profil?error=${encodeURIComponent(res.error)}`)
}

export default async function AgentProfilPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from("profiles").select("nom, prenom, telephone, agent_type, agence, agence_adresse").eq("id", user!.id).maybeSingle()
  const profile = data as {
    nom: string | null; prenom: string | null; telephone: string | null
    agent_type: string | null; agence: string | null; agence_adresse: string | null
  } | null
  const isExterne = profile?.agent_type === "externe"

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
            <input name="nom" defaultValue={profile?.nom ?? ""} required className={field} />
          </div>
        </div>
        <div>
          <label className={label}>Téléphone (WhatsApp)</label>
          <input name="telephone" type="tel" defaultValue={profile?.telephone ?? ""} className={field} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input value={user?.email ?? ""} disabled className={`${field} text-gray-400`} />
          <p className="text-[11px] text-gray-400 mt-1">
            Modifiable depuis <a href="/mon-compte" className="text-blue-700 hover:underline">Mon compte</a>.
          </p>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-1">Type d&apos;agent</p>
          <p className="text-sm text-gray-600">
            {isExterne ? "Agent externe (partenaire)" : "Agent interne Inaya"}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Modifiable uniquement par un administrateur.</p>
        </div>

        {isExterne && (
          <div className="grid grid-cols-1 gap-4 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 -mb-2">Mon agence</p>
            <div>
              <label className={label}>Nom de l&apos;agence</label>
              <input name="agence" defaultValue={profile?.agence ?? ""} placeholder="Ex : Bouaké Immobilier" className={field} />
            </div>
            <div>
              <label className={label}>Adresse de l&apos;agence</label>
              <input name="agence_adresse" defaultValue={profile?.agence_adresse ?? ""} placeholder="Ex : Air France, Bouaké" className={field} />
            </div>
          </div>
        )}

        <button type="submit" className="bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors">
          Enregistrer
        </button>
      </form>
    </div>
  )
}
