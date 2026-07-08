import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Star } from "lucide-react"
import type { UserRole } from "@/types/database"
import TestimonialRow, { type AdminTestimonial } from "./TestimonialRow"

export const dynamic = "force-dynamic"
export const metadata = { title: "Avis · Inaya Immo" }

interface PageProps { searchParams: Promise<{ statut?: string }> }

const FILTERS = [
  { value: "en_attente", label: "En attente" },
  { value: "publie", label: "Publiés" },
  { value: "rejete", label: "Rejetés" },
  { value: "", label: "Tous" },
]

export default async function AdminTemoignagesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/temoignages")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client") as UserRole
  if (!["super_admin", "admin", "moderateur"].includes(myRole)) redirect("/admin/dashboard")

  const statut = params.statut ?? "en_attente"

  let items: AdminTestimonial[] = []
  try {
    let q = createAdminClient().from("testimonials")
      .select("id,nom,note,message,statut,created_at")
      .order("created_at", { ascending: false }).limit(200)
    if (statut) q = q.eq("statut", statut)
    const { data } = await q
    items = (data ?? []) as AdminTestimonial[]
  } catch { /* table absente → liste vide */ }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-500" /> Avis & témoignages
        </h1>
        <p className="text-sm text-gray-500 mt-1">Validez les avis avant leur publication sur le site.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => {
          const active = (params.statut ?? "en_attente") === f.value
          return (
            <a key={f.value || "all"} href={`/admin/temoignages${f.value ? `?statut=${f.value}` : "?statut="}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                active ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
              }`}>
              {f.label}
            </a>
          )
        })}
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
          Aucun avis pour ce filtre.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(t => <TestimonialRow key={t.id} t={t} />)}
        </div>
      )}
    </div>
  )
}
