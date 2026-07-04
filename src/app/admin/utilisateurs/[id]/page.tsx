import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { ROLE_LABEL, ROLE_COLOR, formatRelativeDate } from "@/lib/utils"
import type { UserRole, UserStatus } from "@/types/database"
import UserManage, { type ManageUser } from "./UserManage"

export const metadata = { title: "Gérer l'utilisateur · Inaya Immo" }

const ALL_ROLES: UserRole[] = [
  "client", "proprietaire", "locataire", "prestataire", "apporteur",
  "agent", "comptable", "moderateur", "admin", "super_admin",
]

/** Compte les lignes d'une table pour un utilisateur, en ignorant table/colonne absente. */
async function safeCount(
  admin: ReturnType<typeof createAdminClient>, table: string, col: string, id: string,
): Promise<number> {
  try {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(col, id)
    if (error) return 0
    return count ?? 0
  } catch { return 0 }
}

export default async function ManageUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Garde : super_admin / admin uniquement.
  const supabase = await createClient()
  const { data: { user: me } } = await supabase.auth.getUser()
  if (!me) redirect(`/connexion?redirect=/admin/utilisateurs/${id}`)
  const { data: meProf } = await supabase.from("profiles").select("role").eq("id", me.id).single()
  const myRole = ((meProf as { role: UserRole } | null)?.role ?? "client") as UserRole
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const admin = createAdminClient()

  // Profil cible (jeu complet, repli si colonnes récentes absentes).
  const cols = "id, nom, prenom, telephone, commune, role, status, verifie, created_at"
  let prof = await admin.from("profiles").select(cols).eq("id", id).maybeSingle()
  if (prof.error?.code === "42703") {
    prof = await admin.from("profiles").select("id, nom, prenom, telephone, role, status, created_at").eq("id", id).maybeSingle()
  }
  const p = prof.data as Record<string, unknown> | null
  if (!p) notFound()

  // E-mail depuis auth.users.
  const { data: authUser } = await admin.auth.admin.getUserById(id)
  const email = authUser?.user?.email ?? ""

  const role = (p.role as UserRole) ?? "client"
  const nomComplet = `${(p.prenom as string) || ""} ${(p.nom as string) || ""}`.trim() || "Utilisateur"

  const manageUser: ManageUser = {
    id,
    nom: (p.nom as string) ?? "",
    prenom: (p.prenom as string) ?? "",
    telephone: (p.telephone as string) ?? "",
    commune: (p.commune as string) ?? "",
    email,
    role,
    status: (p.status as UserStatus) ?? "actif",
    verifie: !!p.verifie,
  }

  // Aperçu des contenus rattachés (résilient : 0 si table/colonne absente).
  const [annonces, demandes, recherches, mandats, apports, travaux] = await Promise.all([
    safeCount(admin, "properties", "created_by", id),
    safeCount(admin, "leads", "client_id", id),
    safeCount(admin, "search_requests", "user_id", id),
    safeCount(admin, "mandats", "proprietaire_id", id),
    safeCount(admin, "apports", "apporteur_id", id),
    safeCount(admin, "travaux", "prestataire_id", id),
  ])
  const contenus = [
    { label: "Annonces créées", value: annonces },
    { label: "Mises en relation", value: demandes },
    { label: "Recherches enregistrées", value: recherches },
    { label: "Mandats (biens gérés)", value: mandats },
    { label: "Apports", value: apports },
    { label: "Travaux assignés", value: travaux },
  ]

  const roleOptions = myRole === "super_admin" ? ALL_ROLES : ALL_ROLES.filter(r => r !== "super_admin")
  const isSelf = id === me.id
  const canManageRole = (myRole === "super_admin" || myRole === "admin") && !(role === "super_admin" && myRole !== "super_admin")

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href="/admin/utilisateurs" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700">
        <ArrowLeft className="w-4 h-4" /> Retour aux utilisateurs
      </Link>

      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{nomComplet}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Inscrit {formatRelativeDate(p.created_at as string)}
            {" · "}{email || manageUser.telephone || "—"}
          </p>
        </div>
        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[role] ?? "bg-gray-100 text-gray-600"}`}>
          {ROLE_LABEL[role] ?? role}
        </span>
      </div>

      {/* Contenus rattachés */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {contenus.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Édition / rôle / suppression */}
      <UserManage user={manageUser} roleOptions={roleOptions} canManageRole={canManageRole} isSelf={isSelf} />
    </div>
  )
}
