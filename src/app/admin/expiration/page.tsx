import { createAdminClient } from "@/lib/supabase/server"
import type { ExpiryRule } from "@/types/database"
import ExpiryRulesManager from "./ExpiryRulesManager"
import RunSweepButton from "./RunSweepButton"

export const dynamic = "force-dynamic"

/**
 * Couverture des règles : combien d'annonces publiées portent une date de fin.
 * Sans cet indicateur, un catalogue qui cesse d'expirer passe inaperçu — c'est
 * exactement ce qui s'était produit (117 annonces couvertes sur 4 923).
 */
async function getCouverture() {
  const admin = createAdminClient()
  const head = { count: "exact" as const, head: true }
  const n = (r: { count: number | null }) => r.count ?? 0
  try {
    const [total, avec, echues] = await Promise.all([
      admin.from("properties").select("id", head).eq("statut", "publie").then(n, () => 0),
      admin.from("properties").select("id", head).eq("statut", "publie")
        .not("expire_at", "is", null).then(n, () => 0),
      admin.from("properties").select("id", head).eq("statut", "publie")
        .lt("expire_at", new Date().toISOString()).then(n, () => 0),
    ])
    return { total, avec, echues }
  } catch { return null }
}

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
  const couv = moduleActif ? await getCouverture() : null
  const pct = couv && couv.total > 0 ? Math.round((couv.avec / couv.total) * 100) : 0

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

      {couv && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Couverture des règles</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{pct} %</p>
              <p className="text-xs text-gray-500 mt-0.5">des annonces publiées ont une date de fin</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(couv.total - couv.avec).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">ne correspondent à aucune règle</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{couv.echues.toLocaleString("fr-FR")}</p>
              <p className="text-xs text-gray-500 mt-0.5">échues, en attente du prochain ménage</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Le ménage quotidien traite au maximum 400 annonces par passage : un arriéré important
            se résorbe donc en quelques jours, sans vider le catalogue d&apos;un coup.
          </p>
        </div>
      )}

      {moduleActif && <RunSweepButton />}
      <ExpiryRulesManager rules={rules} />
    </div>
  )
}
