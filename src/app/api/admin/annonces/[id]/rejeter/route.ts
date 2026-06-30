import { createAdminClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const { data: profileData } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  const profile = profileData as { role: string } | null
  if (!profile || !["super_admin","admin","moderateur"].includes(profile.role))
    return new Response("Forbidden", { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin
    .from("properties")
    .update({ statut: "rejete", updated_at: new Date().toISOString() } as never)
    .eq("id", id)

  if (error) {
    console.error("INAYA-DB-003", error)
    return new Response("Erreur serveur", { status: 500 })
  }

  redirect("/admin/annonces?statut=en_attente")
}
