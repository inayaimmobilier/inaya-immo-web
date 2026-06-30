import { ArrowLeft } from "lucide-react"
import CommissionForm from "../CommissionForm"
import { createRuleAndRedirect } from "../actions"

export const metadata = { title: "Nouvelle règle de commission · Inaya Immo" }

interface PageProps {
  searchParams: Promise<{ error?: string }>
}

export default async function NouvelleReglePage({ searchParams }: PageProps) {
  const { error } = await searchParams

  return (
    <div className="p-6 space-y-6">
      <div>
        <a href="/admin/commissions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux règles
        </a>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle règle de commission</h1>
      </div>

      <CommissionForm action={createRuleAndRedirect} error={error} submitLabel="Créer la règle" />
    </div>
  )
}
