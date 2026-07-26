import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import PharmaciesManager, { type Pharmacie } from "./PharmaciesManager"
import PharmacySources from "./PharmacySources"

export const metadata = { title: "Pharmacies de garde · Inaya Admin" }

export default async function AdminPharmaciesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/pharmacies")
  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin", "moderateur"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  let items: Pharmacie[] = []
  try {
    const { data } = await admin.from("pharmacies_garde")
      .select("id, nom, ville, quartier, adresse, telephone, date_debut, date_fin, actif, created_at")
      .order("actif", { ascending: false }).order("created_at", { ascending: false })
    items = (data ?? []) as Pharmacie[]
  } catch { /* table absente avant migration 048 */ }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pharmacies de garde</h1>
        <p className="text-sm text-gray-500 mt-1">
          Les assistants Inaya (site &amp; WhatsApp) donnent ces pharmacies aux utilisateurs qui les demandent.
          Renseignez la garde du jour (ou de la semaine via une période).
        </p>
      </div>
      <div className="mb-6"><PharmacySources /></div>
      <PharmaciesManager initialItems={items} />
    </div>
  )
}
