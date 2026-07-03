import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatPrix, formatRelativeDate } from "@/lib/utils"
import { Home, PlusCircle } from "lucide-react"

export const dynamic = "force-dynamic"

const STATUT_PILL: Record<string, string> = {
  publie: "bg-green-50 text-green-700 border-green-100",
  en_attente_validation: "bg-amber-50 text-amber-700 border-amber-100",
  rejetee: "bg-red-50 text-red-700 border-red-100",
  rejete: "bg-red-50 text-red-700 border-red-100",
  suspendu: "bg-gray-100 text-gray-500 border-gray-200",
}

export default async function MesBiensPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  // Biens rattachés au compte via property_publishers.publisher_id.
  const { data: pubs } = await admin
    .from("property_publishers")
    .select("property_id, publie_le, properties(id,titre,type_offre,statut,prix,quartier,ville)")
    .eq("publisher_id", user?.id ?? "")
    .order("publie_le", { ascending: false })

  type Row = { property_id: string; publie_le: string | null; properties: { id: string; titre: string; type_offre: string; statut: string; prix: number | null; quartier: string | null; ville: string | null } | null }
  const biens = ((pubs ?? []) as Row[]).map(r => r.properties).filter(Boolean) as NonNullable<Row["properties"]>[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Mes biens ({biens.length})</h2>
        <Link href="/publier" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-xl">
          <PlusCircle className="w-4 h-4" /> Ajouter
        </Link>
      </div>

      {biens.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Home className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">Vous n&apos;avez pas encore de bien publié.</p>
          <Link href="/publier" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <PlusCircle className="w-4 h-4" /> Publier mon premier bien
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {biens.map(b => (
            <Link key={b.id} href={`/biens/${b.id}`}
              className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-300 transition-colors">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{b.titre}</p>
                <p className="text-xs text-gray-500">
                  {[b.quartier, b.ville].filter(Boolean).join(", ") || "Localisation non précisée"} · {b.prix ? formatPrix(b.prix) : "Prix sur demande"}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUT_PILL[b.statut] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {b.statut.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
