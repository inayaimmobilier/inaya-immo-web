"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"

type Res = { ok: true } | { ok: false; error: string }

/**
 * Forme canonique d'un numéro : chiffres seuls, sans « 225 » ni zéro initial.
 *
 * ⚠️ RÈGLE DUPLIQUÉE avec `canonTelephone` du whatsapp-service (assistant.ts)
 * et avec la migration 057. Les deux DOIVENT donner le même résultat : c'est
 * ce qui fait qu'une pause posée ici correspond au numéro que le service voit
 * arriver. Si l'une change, l'autre doit changer.
 */
function canonTelephone(s: string): string {
  let d = (s || "").replace(/\D/g, "")
  if (d.startsWith("225")) d = d.slice(3)
  if (d.startsWith("0")) d = d.slice(1)
  return d
}

/** Vérifie que l'appelant est administrateur. Renvoie son id, ou une erreur. */
async function exigerAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (data as { role: UserRole } | null)?.role
  if (role !== "super_admin" && role !== "admin") {
    return { ok: false, error: "Action réservée aux administrateurs." }
  }
  return { ok: true, userId: user.id }
}

/**
 * Met une conversation en pause : l'assistante cesse de répondre à ce numéro,
 * l'admin reprend la main depuis WhatsApp. Les autres conversations continuent.
 */
export async function pauserConversation(telephone: string, motif: string): Promise<Res> {
  const garde = await exigerAdmin()
  if (!garde.ok) return garde

  const canon = canonTelephone(telephone)
  // Huit chiffres : le minimum pour désigner un abonné en Côte d'Ivoire. En
  // dessous, on mettrait en pause un numéro au hasard — ou tous ceux qui
  // finissent pareil.
  if (canon.length < 8) return { ok: false, error: "Numéro incomplet." }

  const admin = createAdminClient()
  const { error } = await admin.from("wa_assistant_pauses").upsert({
    telephone: canon,
    telephone_affiche: telephone.trim(),
    motif: motif.trim() || null,
    pause_par: garde.userId,
  } as never, { onConflict: "telephone" })

  if (error) {
    console.error("INAYA-WAPAUSE-001", error)
    return { ok: false, error: "Échec de l'enregistrement." }
  }
  revalidatePath("/admin/whatsapp/conversations")
  return { ok: true }
}

/** Rend la parole à l'assistante sur cette conversation. */
export async function reprendreConversation(telephone: string): Promise<Res> {
  const garde = await exigerAdmin()
  if (!garde.ok) return garde

  const canon = canonTelephone(telephone)
  if (!canon) return { ok: false, error: "Numéro invalide." }

  const admin = createAdminClient()
  const { error } = await admin.from("wa_assistant_pauses").delete().eq("telephone", canon)
  if (error) {
    console.error("INAYA-WAPAUSE-002", error)
    return { ok: false, error: "Échec de la réactivation." }
  }
  revalidatePath("/admin/whatsapp/conversations")
  return { ok: true }
}
