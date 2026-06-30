import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Copy, ArrowLeft, ShieldCheck } from "lucide-react"
import type { UserRole } from "@/types/database"
import MergeGroup, { type DupItem } from "./MergeGroup"

export const metadata = { title: "Doublons d'annonces · Inaya Immo" }

interface PropRow extends DupItem {
  fingerprint: string | null
  dedup_status: string
}

export default async function DoublonsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/annonces/doublons")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  const staff = ["super_admin", "admin", "moderateur", "agent"]
  if (!staff.includes(myRole)) redirect("/")

  // Annonces non absorbées, avec empreinte définie
  const { data } = await supabase
    .from("properties")
    .select("id,titre,prix,statut,quartier,created_at,publishers_count,fingerprint,dedup_status")
    .neq("dedup_status", "merged")
    .not("fingerprint", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000)
  const rows = (data ?? []) as unknown as PropRow[]

  // Regroupe par empreinte ; ne garde que les groupes de 2+
  const byFp = new Map<string, PropRow[]>()
  for (const r of rows) {
    if (!r.fingerprint) continue
    const arr = byFp.get(r.fingerprint) ?? []
    arr.push(r)
    byFp.set(r.fingerprint, arr)
  }
  const groups = [...byFp.values()].filter(g => g.length > 1)

  return (
    <div className="p-6 space-y-6">
      <div>
        <a href="/admin/annonces" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux annonces
        </a>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Copy className="w-6 h-6 text-amber-500" /> Doublons potentiels
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Annonces partageant la même empreinte (type, catégorie, zone, chambres, surface).
          Fusionnez-les en une seule : les publieurs sont conservés et classés par ordre d&apos;apparition.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <ShieldCheck className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900">Aucun doublon détecté</p>
          <p className="text-xs text-gray-400 mt-1">Toutes les annonces actuelles sont uniques.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
            {groups.length} groupe{groups.length > 1 ? "s" : ""} de doublons à traiter
          </div>
          <div className="space-y-5">
            {groups.map((g, i) => (
              <MergeGroup key={i} items={g.map(({ id, titre, prix, statut, quartier, created_at, publishers_count }) => ({
                id, titre, prix, statut, quartier, created_at, publishers_count,
              }))} />
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-gray-400">
        Astuce : choisissez l&apos;annonce <strong>à conserver</strong> (par défaut la plus ancienne, = premier publieur).
        Les autres sont absorbées : retirées de la diffusion publique, leur publieur est ajouté à la liste ordonnée
        de l&apos;annonce conservée. Aucun contact propriétaire n&apos;est jamais exposé au client.
      </p>
    </div>
  )
}
