import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import AdminSidebar from "@/components/admin/Sidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/connexion?redirect=/admin/dashboard")

  type ProfileRow = { role: string; nom: string | null; prenom: string | null; telegram_chat_id: string | null; agent_type?: string | null }

  // 42703 = colonne telegram_chat_id absente (migration 030 non encore appliquée)
  const profileResult = await supabase
    .from("profiles").select("role, nom, prenom, telegram_chat_id, agent_type").eq("id", user.id).single()
  let profile: ProfileRow | null
  if (profileResult.error?.code === "42703") {
    const r2 = await supabase.from("profiles").select("role, nom, prenom").eq("id", user.id).single() as unknown as { data: Omit<ProfileRow, "telegram_chat_id"> | null }
    profile = r2.data ? { ...r2.data, telegram_chat_id: null } : null
  } else {
    profile = (profileResult.data as ProfileRow | null) ?? null
  }
  const allowed = ["super_admin", "admin", "moderateur", "agent"]
  if (!profile || !allowed.includes(profile.role)) redirect("/")

  // ── AGENT EXTERNE : PAS DE BACK-OFFICE ────────────────────────────────────
  //
  // Un agent d'une AUTRE agence voyait ici la fréquentation du site, le nombre
  // total d'annonces, les leads et les alertes de toute la plateforme —
  // autrement dit l'activité commerciale d'Inaya et de ses concurrents réunis.
  // Le rôle `agent` couvre deux réalités opposées : les agents d'Inaya, qui
  // travaillent dans le back-office, et les professionnels extérieurs, qui sont
  // des CLIENTS du service. Seul `agent_type` les sépare.
  //
  // On renvoie vers l'espace professionnel plutôt que vers l'accueil : il a
  // quelque chose à y faire, et un renvoi muet vers la page d'accueil se lirait
  // comme une panne.
  if (profile.role === "agent" && profile.agent_type === "externe") redirect("/agent")

  // Réservations de résidences en attente → pastille rouge sur « Résidences ».
  let residenceAlerts = 0
  try {
    const { count } = await createAdminClient()
      .from("leads")
      .select("id, properties!inner(type_offre)", { count: "exact", head: true })
      .eq("properties.type_offre", "residence_meublee")
      .eq("validation_proprietaire", "en_attente")
    residenceAlerts = count ?? 0
  } catch { /* ignore */ }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        role={profile.role}
        nom={`${profile.prenom || ""} ${profile.nom || ""}`.trim() || user.email || "Admin"}
        residenceAlerts={residenceAlerts}
        userId={user.id}
        telegramChatId={profile.telegram_chat_id}
        botUsername={process.env.TELEGRAM_BOT_USERNAME ?? ""}
      />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
