import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Users } from "lucide-react"
import UserRow, { type UserRowData } from "./UserRow"
import CreateUserModal from "./CreateUserModal"
import type { UserRole } from "@/types/database"

export const metadata = { title: "Utilisateurs · Inaya Immo" }

const PER_PAGE = 50

interface PageProps {
  searchParams: Promise<{ role?: string; q?: string }>
}

async function getUsers(filterRole?: string, search?: string) {
  const admin = createAdminClient()

  let query = admin
    .from("profiles")
    .select("id, nom, prenom, telephone, telegram_chat_id, role, status, created_at")
    .order("created_at", { ascending: false })
    .limit(PER_PAGE)

  if (filterRole) query = query.eq("role", filterRole as never)

  let { data: profilesData, error } = await query
  // 42703 = colonne telegram_chat_id absente (migration 030 non encore appliquée)
  if (error?.code === "42703") {
    const fallback = await admin
      .from("profiles")
      .select("id, nom, prenom, telephone, role, status, created_at")
      .order("created_at", { ascending: false })
      .limit(PER_PAGE)
      .then(r => r)
    profilesData = (fallback.data ?? []).map((p: Record<string, unknown>) => ({ ...p, telegram_chat_id: null })) as never
    error = null
  }
  if (error) {
    console.error("INAYA-DB-012", error)
    return []
  }
  const profiles = (profilesData ?? []) as Omit<UserRowData, "email">[]

  // Emails depuis auth.users (non stockés dans profiles)
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailById = new Map((authData?.users ?? []).map(u => [u.id, u.email ?? null]))

  let rows: UserRowData[] = profiles.map(p => ({
    ...p,
    email: emailById.get(p.id) ?? null,
  }))

  if (search) {
    const s = search.toLowerCase()
    rows = rows.filter(r =>
      `${r.prenom ?? ""} ${r.nom ?? ""}`.toLowerCase().includes(s) ||
      (r.email ?? "").toLowerCase().includes(s) ||
      (r.telephone ?? "").includes(s)
    )
  }

  return rows
}

export default async function UtilisateursPage({ searchParams }: PageProps) {
  const params = await searchParams

  // Garde supplémentaire : seuls super_admin / admin accèdent à cette page
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/utilisateurs")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const me = meData as { role: UserRole } | null
  const myRole = (me?.role ?? "client") as UserRole
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const users = await getUsers(params.role, params.q)
  const tgBotUsername = process.env.TELEGRAM_BOT_USERNAME ?? ""

  const FILTERS: { value: string; label: string }[] = [
    { value: "", label: "Tous" },
    { value: "client", label: "Chercheurs" },
    { value: "proprietaire", label: "Propriétaires" },
    { value: "locataire", label: "Locataires" },
    { value: "prestataire", label: "Prestataires" },
    { value: "apporteur", label: "Apporteurs" },
    { value: "agent", label: "Agents" },
    { value: "comptable", label: "Comptables" },
    { value: "moderateur", label: "Modérateurs" },
    { value: "admin", label: "Admins" },
    { value: "super_admin", label: "Super admins" },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" /> Utilisateurs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion des rôles et des accès · {users.length} affiché{users.length > 1 ? "s" : ""}
          </p>
        </div>

        {/* Actions : recherche + création */}
        <div className="flex gap-2 items-center flex-wrap">
        <CreateUserModal canCreateSuperAdmin={myRole === "super_admin"} />
        <form action="/admin/utilisateurs" method="get" className="flex gap-2">
          {params.role && <input type="hidden" name="role" value={params.role} />}
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Nom, email, téléphone…"
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 w-56"
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
            Rechercher
          </button>
        </form>
        </div>
      </div>

      {/* Filtres par rôle */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => {
          const active = (params.role || "") === f.value
          const href = f.value
            ? `/admin/utilisateurs?role=${f.value}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`
            : `/admin/utilisateurs${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`
          return (
            <a
              key={f.value || "all"}
              href={href}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
              }`}
            >
              {f.label}
            </a>
          )
        })}
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {users.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">Aucun utilisateur trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Téléphone</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Inscrit</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <UserRow key={u.id} user={u} myRole={myRole} isSelf={u.id === user.id} botUsername={tgBotUsername || undefined} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Note : seul un <strong>super admin</strong> peut attribuer ou retirer le rôle super admin.
        Les modifications sont enregistrées immédiatement.
      </p>
    </div>
  )
}
