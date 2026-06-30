import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import ServicesManager from "./ServicesManager"
import type { Banner } from "./ServicesManager"

export const metadata = { title: "Services · Inaya Admin" }

export default async function AdminServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/services")

  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (profileData as { role: UserRole } | null)?.role
  if (!role || !["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  let banners: Banner[] = []
  try {
    const { data } = await admin.from("service_banners").select("*").order("ordre")
    banners = (data ?? []) as Banner[]
  } catch { /* table absente avant migration 011 */ }

  return (
    <div className="p-6 max-w-3xl">
      <ServicesManager initialBanners={banners} />
    </div>
  )
}
