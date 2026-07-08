"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Soumission publique d'un témoignage (note + message). Passe en modération
 * (statut « en_attente ») avant d'être affiché.
 */
export async function submitTestimonial(input: {
  nom: string; note: number; message: string
}): Promise<Result> {
  const nom = input.nom.trim()
  const note = Number(input.note)
  const message = input.message.trim()

  if (!nom) return { ok: false, error: "Votre nom est requis." }
  if (!(note >= 1 && note <= 5)) return { ok: false, error: "Donnez une note de 1 à 5 étoiles." }
  if (message.length < 5) return { ok: false, error: "Votre message est un peu court." }

  // Rattache le compte si l'utilisateur est connecté (facultatif).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { error } = await admin.from("testimonials").insert({
    user_id: user?.id ?? null, nom, note, message, statut: "en_attente",
  } as never)

  if (error) {
    // PGRST205/42P01 = table absente (migration 035 non appliquée).
    if (error.code === "PGRST205" || error.code === "42P01")
      return { ok: false, error: "Les avis ne sont pas encore activés. Réessayez bientôt." }
    console.error("INAYA-TESTIMONIAL-001", error.message)
    return { ok: false, error: "Échec de l'envoi de votre avis. Réessayez." }
  }

  revalidatePath("/temoignages")
  revalidatePath("/")
  return { ok: true }
}
