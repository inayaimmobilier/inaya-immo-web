"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

/** Marque toutes les notifications du client comme lues. */
export async function markAllRead(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from("notifications").update({ lu: true } as never).eq("user_id", user.id).eq("lu", false)
  revalidatePath("/client/notifications")
  revalidatePath("/client", "layout")
}
