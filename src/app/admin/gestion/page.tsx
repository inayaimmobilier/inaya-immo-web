import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Building2, ChevronRight } from "lucide-react"
import CreateMandatForm from "./CreateMandatForm"

export const dynamic = "force-dynamic"

type Owner = { id: string; nom: string | null; prenom: string | null }
type Prop = { id: string; titre: string }

export default async function GestionLocativePage() {
  const admin = createAdminClient()

  // Mandats (résilient si migration 032 absente).
  type MandatRow = {
    id: string; type: string; commission_pct: number | null; actif: boolean; date_debut: string | null
    profiles: { nom: string | null; prenom: string | null } | null
    properties: { titre: string } | null
  }
  let mandats: MandatRow[] = []
  let moduleActif = true
  {
    const { data, error } = await admin.from("mandats")
      .select("id,type,commission_pct,actif,date_debut,profiles:proprietaire_id(nom,prenom),properties(titre)")
      .order("created_at", { ascending: false }).limit(200)
    if (error && (error.code === "PGRST205" || error.code === "42P01")) moduleActif = false
    else mandats = (data ?? []) as MandatRow[]
  }

  // Propriétaires « gérés » + biens, pour le formulaire de création (résilient).
  let owners: Owner[] = []
  {
    const { data, error } = await admin.from("profiles")
      .select("id,nom,prenom,role,proprietaire_type").eq("role", "proprietaire")
    if (!error && data) {
      owners = (data as (Owner & { proprietaire_type: string | null })[])
        .filter(o => o.proprietaire_type === "gere" || o.proprietaire_type == null)
    } else {
      // colonne proprietaire_type absente → on prend tous les proprietaire
      const { data: d2 } = await admin.from("profiles").select("id,nom,prenom").eq("role", "proprietaire")
      owners = (d2 ?? []) as Owner[]
    }
  }
  const { data: propsData } = await admin.from("properties").select("id,titre").order("created_at", { ascending: false }).limit(300)
  const properties = (propsData ?? []) as Prop[]

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestion locative</h1>
        <p className="text-sm text-gray-500 mt-0.5">Mandats de gestion, encaissements, locataires, travaux et versements</p>
      </div>

      {!moduleActif && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          Le module n&apos;est pas encore activé en base : appliquez la <strong>migration 032</strong> dans Supabase (SQL Editor).
        </div>
      )}

      <CreateMandatForm owners={owners} properties={properties} />

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Mandats ({mandats.length})</h2>
        </div>
        {mandats.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">Aucun mandat de gestion pour le moment.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {mandats.map(m => {
              const owner = `${m.profiles?.prenom ?? ""} ${m.profiles?.nom ?? ""}`.trim() || "Propriétaire"
              return (
                <li key={m.id}>
                  <Link href={`/admin/gestion/${m.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50/60">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.properties?.titre ?? "Bien non lié"}</p>
                      <p className="text-xs text-gray-500">{owner} · {m.type.replace(/_/g, " ")}{m.commission_pct ? ` · ${m.commission_pct}%` : ""}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
