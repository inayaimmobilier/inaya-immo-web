import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Users, ShieldAlert } from "lucide-react"
import { type UserRowData } from "./UserRow"
import UsersTable from "./UsersTable"
import CreateUserModal from "./CreateUserModal"
import type { UserRole } from "@/types/database"

export const metadata = { title: "Utilisateurs · Inaya Immo" }

const PER_PAGE = 50

interface PageProps {
  searchParams: Promise<{ role?: string; q?: string; verifie?: string }>
}

async function getUsers(filterRole?: string, search?: string, onlyUnverified?: boolean) {
  const admin = createAdminClient()

  let query = admin
    .from("profiles")
    .select("id, nom, prenom, telephone, telegram_chat_id, role, status, verifie, created_at")
    .order("created_at", { ascending: false })
    .limit(PER_PAGE)

  if (filterRole) query = query.eq("role", filterRole as never)

  let { data: profilesData, error } = await query
  // 42703 = colonne absente (verifie → migration 034, telegram_chat_id → migration 030).
  if (error?.code === "42703") {
    const fallback = await admin
      .from("profiles")
      .select("id, nom, prenom, telephone, role, status, created_at")
      .order("created_at", { ascending: false })
      .limit(PER_PAGE)
      .then(r => r)
    profilesData = (fallback.data ?? []).map((p: Record<string, unknown>) => ({ ...p, telegram_chat_id: null, verifie: false })) as never
    error = null
  }
  if (error) {
    console.error("INAYA-DB-012", error)
    return []
  }
  const profiles = (profilesData ?? []).map((p: Record<string, unknown>) => ({ verifie: false, ...p })) as Omit<UserRowData, "email">[]

  // Emails depuis auth.users (non stockés dans profiles)
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailById = new Map((authData?.users ?? []).map(u => [u.id, u.email ?? null]))

  let rows: UserRowData[] = profiles.map(p => ({
    ...p,
    email: emailById.get(p.id) ?? null,
  }))

  if (onlyUnverified) rows = rows.filter(r => !r.verifie)

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

  const onlyUnverified = params.verifie === "non"
  const users = await getUsers(onlyUnverified ? undefined : params.role, params.q, onlyUnverified)
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

      {/* Filtres par rôle + non vérifiés */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => {
          const active = !onlyUnverified && (params.role || "") === f.value
          const qs = params.q ? `${f.value ? "&" : "?"}q=${encodeURIComponent(params.q)}` : ""
          const href = f.value ? `/admin/utilisateurs?role=${f.value}${qs}` : `/admin/utilisateurs${qs}`
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
        {/* Non vérifiés — pour repérer et purger les comptes de test */}
        <a
          href={`/admin/utilisateurs?verifie=non${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
            onlyUnverified ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Non vérifiés
        </a>
      </div>

      {/* Tableau (sélection + suppression groupée en vue « Non vérifiés ») */}
      <UsersTable
        users={users}
        myRole={myRole}
        selfId={user.id}
        botUsername={tgBotUsername || undefined}
        selectionMode={onlyUnverified}
      />

      <p className="text-xs text-gray-400">
        Note : seul un <strong>super admin</strong> peut attribuer ou retirer le rôle super admin.
        Les modifications sont enregistrées immédiatement.
      </p>
    </div>
  )
}
