import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Heart } from "lucide-react"
import PropertyCard from "@/components/properties/PropertyCard"
import type { Database } from "@/types/database"

export const metadata = { title: "Favoris · Inaya Immo" }

type Property = Database["public"]["Tables"]["properties"]["Row"] & {
  property_media?: Array<{ url: string; type: string; ordre: number }>
  zones?: { nom: string } | null
}
interface FavRow { property_id: string; properties: Property | null }

export default async function FavorisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from("favorites")
    .select("property_id, properties(*, property_media(url,type,ordre,thumbnail_url), zones(nom))")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
  const favs = ((data ?? []) as unknown as FavRow[]).filter(f => f.properties && f.properties.statut === "publie")

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Les annonces que vous avez sauvegardées.</p>

      {favs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Heart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucun favori pour l&apos;instant.</p>
          <Link href="/biens" className="inline-block mt-3 text-sm text-blue-700 font-medium hover:text-blue-800">
            Parcourir les annonces →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {favs.map(f => <PropertyCard key={f.property_id} property={f.properties as Property} />)}
        </div>
      )}
    </div>
  )
}
