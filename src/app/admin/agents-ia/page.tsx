import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Bot } from "lucide-react"
import type { UserRole } from "@/types/database"
import AgentsManager, { type AiAgent } from "./AgentsManager"

export const metadata = { title: "Agents IA · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function AgentsIaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/agents-ia")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin", "moderateur"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  const { data, error } = await admin.from("ai_agents")
    .select("id,nom,role,canaux,system_prompt,base_connaissance,modele,actif")
    .order("created_at", { ascending: true })
  // Table absente (migration 040 non appliquée) → liste vide + note.
  const missing = error?.code === "42P01" || error?.code === "PGRST205"
  const agents = (data ?? []) as AiAgent[]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-600" /> Agents IA
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Gérez les agents IA qui travaillent pour Inaya (WhatsApp, site…).</p>
      </div>

      {missing ? (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-800">
          La table <code>ai_agents</code> n&apos;existe pas encore. Appliquez la migration <code>040_ai_agents.sql</code> dans Supabase, puis rechargez.
        </div>
      ) : (
        <AgentsManager agents={agents} />
      )}
    </div>
  )
}
