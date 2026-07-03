import { createAdminClient } from "@/lib/supabase/server"
import type { ExpiryRule } from "@/types/database"
import ExpiryRulesManager from "./ExpiryRulesManager"

export const dynamic = "force-dynamic"

export default async function ExpirationPage() {
  const admin = createAdminClient()
  let rules: ExpiryRule[] = []
  let moduleActif = true
  {
    const { data, error } = await admin.from("expiry_rules")
      .select("*").order("priorite", { ascending: false }).order("created_at", { ascending: false })
    if (error && (error.code === "PGRST205" || error.code === "42P01")) moduleActif = false
    else rules = (data ?? []) as ExpiryRule[]
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Durée de vie des annonces</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Programmez combien de temps une annonce reste en ligne, selon des critères (type, opération, zone, prix…).
          La 1re règle qui correspond (par priorité) s&apos;applique ; au-delà, l&apos;annonce passe en « expirée ».
        </p>
      </div>

      {!moduleActif && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          Module non activé : appliquez la <strong>migration 033</strong> dans Supabase (SQL Editor).
        </div>
      )}

      <ExpiryRulesManager rules={rules} />
    </div>
  )
}
