// Lecture serveur des témoignages. Résilient : renvoie une liste vide si la
// table n'existe pas encore (migration 035 non appliquée).
import { createAdminClient } from "@/lib/supabase/server"

export interface Testimonial {
  id: string
  nom: string
  note: number
  message: string
  created_at: string
}

export async function getPublishedTestimonials(limit = 100): Promise<{
  items: Testimonial[]; average: number; count: number
}> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("testimonials")
      .select("id,nom,note,message,created_at")
      .eq("statut", "publie")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) return { items: [], average: 0, count: 0 }
    const items = (data ?? []) as Testimonial[]
    const count = items.length
    const average = count ? Math.round((items.reduce((s, t) => s + (t.note || 0), 0) / count) * 10) / 10 : 0
    return { items, average, count }
  } catch {
    return { items: [], average: 0, count: 0 }
  }
}
