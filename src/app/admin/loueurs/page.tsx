import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Car, Clock, CheckCircle2, PauseCircle } from "lucide-react"
import type { UserRole } from "@/types/database"
import LoueursManager, { type Loueur } from "./LoueursManager"

export const metadata = { title: "Loueurs · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function LoueursPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/loueurs")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (me as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  const { data, error } = await admin.from("loueurs")
    .select("id,type,raison_sociale,nom_contact,telephone,telephone_2,email,adresse,ville,quartier," +
            "numero_identification,commission_pourcent,contrat_debut,contrat_fin,paiement_mode," +
            "paiement_details,statut,motif_refus,notes_internes,profile_id,created_at")
    .order("created_at", { ascending: false })

  // Table absente = migration 059 non appliquée. On le dit au lieu d'afficher
  // une page vide qui laisserait croire qu'aucun loueur n'existe.
  const manqueTable = error?.code === "42P01" || error?.code === "PGRST205"
  const loueurs = (data ?? []) as Loueur[]

  // Nombre de véhicules par loueur : c'est le chiffre qu'on cherche en ouvrant
  // cette page, et il évite d'aller compter ailleurs.
  const flotte = new Map<string, number>()
  if (!manqueTable) {
    const { data: v } = await admin.from("vehicules").select("loueur_id")
    for (const row of (v ?? []) as { loueur_id: string }[]) {
      flotte.set(row.loueur_id, (flotte.get(row.loueur_id) ?? 0) + 1)
    }
  }

  const compte = (s: string) => loueurs.filter(l => l.statut === s).length
  const kpis = [
    { label: "En attente", valeur: compte("en_attente"), Icon: Clock, teinte: "text-amber-600 bg-amber-50" },
    { label: "Actifs", valeur: compte("actif"), Icon: CheckCircle2, teinte: "text-green-600 bg-green-50" },
    { label: "Suspendus", valeur: compte("suspendu"), Icon: PauseCircle, teinte: "text-gray-500 bg-gray-100" },
    { label: "Véhicules confiés", valeur: [...flotte.values()].reduce((a, b) => a + b, 0), Icon: Car, teinte: "text-blue-600 bg-blue-50" },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Car className="w-6 h-6 text-blue-600" /> Loueurs de véhicules
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Agences, sociétés de taxi et particuliers qui confient des véhicules à la location.
        </p>
      </div>

      {manqueTable ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          La table <code>loueurs</code> n&apos;existe pas encore. Appliquez la migration{" "}
          <code>059_location_vehicules.sql</code> dans Supabase, puis rechargez.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(({ label, valeur, Icon, teinte }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${teinte}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{valeur}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <LoueursManager
            loueurs={loueurs}
            flotte={Object.fromEntries(flotte)}
          />
        </>
      )}
    </div>
  )
}
