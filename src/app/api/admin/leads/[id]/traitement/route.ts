import { createAdminClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const admin = createAdminClient()
  await admin
    .from("leads")
    .update({ statut: "en_traitement", pris_en_charge_le: new Date().toISOString(), agent_id: user.id } as never)
    .eq("id", id)

  redirect("/admin/leads")
}
