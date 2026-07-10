import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { postLoginPath } from "@/lib/account-actions"
import VerifyGate from "./VerifyGate"

export const metadata = { title: "Vérification · Inaya Immo" }
export const dynamic = "force-dynamic"

const STAFF_ROLES = ["super_admin", "admin", "moderateur", "agent", "comptable"]

export default async function VerifierPage({
  searchParams,
}: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect: rawRedirect } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/verifier")

  // Rôle + statut de vérif (client admin : lecture fiable, hors RLS).
  const { data } = await createAdminClient().from("profiles").select("role, verifie").eq("id", user.id).maybeSingle()
  const profile = data as { role: string; verifie: boolean } | null

  // Destination une fois vérifié (ou si déjà vérifié / staff exempté).
  const target = await postLoginPath()
  // On n'accepte qu'une redirection interne (jamais une URL absolue arbitraire).
  const safeRedirect = rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : target

  // Déjà vérifié, ou compte staff (exempté d'OTP) → on ne bloque pas.
  if (!profile || profile.verifie || STAFF_ROLES.includes(profile.role)) redirect(safeRedirect)

  return <VerifyGate redirectTo={safeRedirect} />
}
