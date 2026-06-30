"use client"

import { useMemo, useState } from "react"
import { Calculator } from "lucide-react"
import { CATEGORIE_LABEL, formatPrix } from "@/lib/utils"
import { selectRule, computeCommission, type CommissionRule } from "@/lib/commissions"

const CATEGORIES = Object.keys(CATEGORIE_LABEL)

interface Props {
  rules: CommissionRule[]
}

export default function Simulator({ rules }: Props) {
  const [typeOp, setTypeOp] = useState<"location" | "vente">("vente")
  const [categorie, setCategorie] = useState<string>("")
  const [zone, setZone] = useState("")
  const [montant, setMontant] = useState<string>("")

  const result = useMemo(() => {
    const m = Number(montant)
    if (!montant || Number.isNaN(m) || m <= 0) return null
    const ctx = {
      type_operation: typeOp,
      categorie: (categorie || undefined) as never,
      zone: zone || undefined,
      montant: m,
    }
    const rule = selectRule(rules, ctx)
    if (!rule) return { rule: null }
    return computeCommission(rule, ctx)
  }, [typeOp, categorie, zone, montant, rules])

  const fld = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Calculator className="w-4 h-4 text-blue-600" /> Simulateur de commission
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <select value={typeOp} onChange={e => setTypeOp(e.target.value as "location" | "vente")} className={fld}>
          <option value="vente">Vente</option>
          <option value="location">Location</option>
        </select>
        <select value={categorie} onChange={e => setCategorie(e.target.value)} className={fld}>
          <option value="">Toute catégorie</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORIE_LABEL[c]}</option>)}
        </select>
        <input value={zone} onChange={e => setZone(e.target.value)} placeholder="Quartier" className={fld} />
        <input
          type="number"
          value={montant}
          onChange={e => setMontant(e.target.value)}
          placeholder={typeOp === "vente" ? "Prix de vente" : "Loyer mensuel"}
          className={fld}
        />
      </div>

      {!result ? (
        <p className="text-xs text-gray-400">Renseignez un montant pour simuler la commission.</p>
      ) : !result.rule ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
          Aucune règle applicable et aucune règle par défaut définie. Créez une règle par défaut.
        </div>
      ) : (
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
          <p className="text-xs text-gray-500">
            Règle appliquée : <span className="font-medium text-gray-800">{result.rule.nom}</span>
            {result.rule.est_defaut && <span className="ml-1 text-amber-600">(défaut)</span>}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-700">{formatPrix(result.total!)}</span>
            <span className="text-xs text-gray-500">de commission</span>
            {result.clamped && <span className="text-[11px] text-amber-600">(plancher/plafond appliqué)</span>}
          </div>
          <div className="flex gap-6 text-xs text-gray-600 pt-1">
            <span>Inaya : <strong>{formatPrix(result.partInaya!)}</strong></span>
            <span>Agent : <strong>{formatPrix(result.partAgent!)}</strong> ({result.rule.split_agent_pct} %)</span>
          </div>
        </div>
      )}
    </div>
  )
}
