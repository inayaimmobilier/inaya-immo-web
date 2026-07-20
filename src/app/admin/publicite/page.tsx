import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import AdsManager from "./AdsManager"

export const dynamic = "force-dynamic"

export const metadata = { title: "Publicité · Inaya Immo" }

export default async function PublicitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/publicite")
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (prof as { role?: string } | null)?.role
  if (role !== "super_admin" && role !== "admin") redirect("/admin/dashboard")

  const admin = createAdminClient()
  const [{ data: spaces }, { data: items }] = await Promise.all([
    admin.from("ad_spaces").select("*").order("ordre"),
    admin.from("ad_items").select("*").order("priority", { ascending: false }),
  ])

  return <AdsManager
    initialSpaces={spaces ?? []}
    initialItems={items ?? []}
  />
}
