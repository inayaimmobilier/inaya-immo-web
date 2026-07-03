import { createAdminClient } from "@/lib/supabase/server"
import ApportsManager from "./ApportsManager"

export const dynamic = "force-dynamic"

export default async function ApportsPage() {
  const admin = createAdminClient()

  type Row = { id: string; type: string; montant: number | null; statut: string; created_at: string; notes: string | null; profiles: { nom: string | null; prenom: string | null } | null; properties: { titre: string } | null }
  let apports: Row[] = []
  let moduleActif = true
  {
    const { data, error } = await admin.from("apports")
      .select("id,type,montant,statut,created_at,notes,profiles:apporteur_id(nom,prenom),properties(titre)")
      .order("created_at", { ascending: false }).limit(200)
    if (error && (error.code === "PGRST205" || error.code === "42P01")) moduleActif = false
    else apports = (data ?? []) as Row[]
  }

  const { data: appData } = await admin.from("profiles").select("id,nom,prenom").eq("role", "apporteur")
  const apporteurs = (appData ?? []) as { id: string; nom: string | null; prenom: string | null }[]
  const { data: propsData } = await admin.from("properties").select("id,titre").order("created_at", { ascending: false }).limit(300)
  const properties = (propsData ?? []) as { id: string; titre: string }[]

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Apports d&apos;affaires</h1>
        <p className="text-sm text-gray-500 mt-0.5">Commissions d&apos;apport des apporteurs (biens et clients)</p>
      </div>
      {!moduleActif && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          Module non activé : appliquez la <strong>migration 032</strong> dans Supabase.
        </div>
      )}
      <ApportsManager apports={apports} apporteurs={apporteurs} properties={properties} />
    </div>
  )
}
