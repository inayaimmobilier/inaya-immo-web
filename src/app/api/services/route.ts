import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from("service_banners")
    .select("id,titre,sous_titre,description,categorie,icone,couleur,cta_label,cta_lien,image_url,ordre")
    .eq("actif", true)
    .order("ordre")
  return NextResponse.json(data ?? [])
}
