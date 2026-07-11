import { redirect, notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"

// URL courte publique « /annonces/1664 » (numéro d'annonce) → redirige vers la
// fiche « /biens/{uuid} ». Permet à l'assistant WhatsApp/site d'utiliser un lien
// court et lisible tout en gardant une seule page de détail.
export const dynamic = "force-dynamic"

export default async function AnnonceShortcut({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const num = Number(String(ref).replace(/\D/g, ""))
  if (!Number.isFinite(num) || num <= 0) notFound()

  const admin = createAdminClient()
  const { data } = await admin.from("properties").select("id").eq("reference", num).eq("statut", "publie").maybeSingle()
  const prop = data as { id: string } | null
  if (!prop) notFound()
  redirect(`/biens/${prop.id}`)
}
