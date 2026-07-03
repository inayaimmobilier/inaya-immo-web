import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatPrix } from "@/lib/utils"
import { Home, PlusCircle, Wallet, Users, Wrench, Banknote, CheckCircle2, Clock } from "lucide-react"

export const dynamic = "force-dynamic"

/** Compte résilient : renvoie 0 si la table n'existe pas encore (PGRST205/42P01). */
async function safeCount(fn: () => PromiseLike<{ count: number | null }>): Promise<number> {
  try { const { count } = await fn(); return count ?? 0 } catch { return 0 }
}
async function safeSum(admin: ReturnType<typeof createAdminClient>, table: string, col: string, ownerId: string, extra?: Record<string, string>): Promise<number> {
  try {
    let q = admin.from(table).select(col).eq("proprietaire_id", ownerId)
    if (extra) for (const [k, v] of Object.entries(extra)) q = q.eq(k, v)
    const { data, error } = await q
    if (error || !data) return 0
    return (data as Record<string, number>[]).reduce((s, r) => s + (Number(r[col]) || 0), 0)
  } catch { return 0 }
}

export default async function ProprietaireDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id ?? ""
  const admin = createAdminClient()

  // Sous-type (résilient).
  let managed = false
  try {
    const { data } = await supabase.from("profiles").select("proprietaire_type").eq("id", uid).single()
    managed = (data as { proprietaire_type: string | null } | null)?.proprietaire_type === "gere"
  } catch { /* colonne absente → diffuseur par défaut */ }

  // Mes biens (via publisher_id).
  const biensTotal = await safeCount(() =>
    admin.from("property_publishers").select("id", { count: "exact", head: true }).eq("publisher_id", uid))

  if (!managed) {
    // ── Propriétaire DIFFUSEUR ──
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard icon={Home} label="Mes biens" value={String(biensTotal)} color="blue" />
          <Link href="/publier" className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-4 font-semibold text-sm">
            <PlusCircle className="w-5 h-5" /> Ajouter un bien
          </Link>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Diffusez vos biens sur Inaya</h2>
          <p className="text-sm text-gray-500">
            Publiez vos biens (location ou vente) en quelques minutes. Nos équipes les vérifient, puis nous gérons la mise en relation avec les clients — vos coordonnées restent confidentielles.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/proprietaire/biens" className="text-sm font-medium text-blue-700 hover:underline">Voir mes biens →</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Propriétaire GÉRÉ (gestion locative) ──
  const moisCourant = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  const [encaissesMois, versementsAttendus, locatairesActifs, travauxOuverts] = await Promise.all([
    safeSum(admin, "encaissements", "montant", uid, { periode: moisCourant, statut: "encaisse" }),
    safeSum(admin, "versements", "montant_net", uid, { statut: "planifie" }),
    safeCount(() => admin.from("locataires").select("id", { count: "exact", head: true }).eq("proprietaire_id", uid).eq("statut", "actif")),
    safeCount(() => admin.from("travaux").select("id", { count: "exact", head: true }).eq("proprietaire_id", uid).neq("statut", "termine").neq("statut", "annule")),
  ])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Encaissé ce mois" value={formatPrix(encaissesMois)} color="green" />
        <KpiCard icon={Banknote} label="À vous reverser" value={formatPrix(versementsAttendus)} color="blue" />
        <KpiCard icon={Users} label="Locataires actifs" value={String(locatairesActifs)} color="indigo" />
        <KpiCard icon={Wrench} label="Travaux en cours" value={String(travauxOuverts)} color="amber" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <SectionLink href="/proprietaire/encaissements" icon={Wallet} title="Encaissements" desc="Loyers perçus par bien et par période" />
        <SectionLink href="/proprietaire/versements" icon={Banknote} title="Versements" desc="Ce que nous vous reversons (net de commission et frais)" />
        <SectionLink href="/proprietaire/locataires" icon={Users} title="Locataires" desc="Baux, échéances et suivi des occupants" />
        <SectionLink href="/proprietaire/travaux" icon={Wrench} title="Travaux" desc="Interventions, coûts et avancement" />
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Home className="w-3.5 h-3.5" /> {biensTotal} bien(s) sous mandat de gestion.
      </p>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof Home; label: string; value: string; color: string }) {
  const c: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50", green: "text-green-600 bg-green-50",
    indigo: "text-indigo-600 bg-indigo-50", amber: "text-amber-600 bg-amber-50",
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${c[color] ?? c.blue}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function SectionLink({ href, icon: Icon, title, desc }: { href: string; icon: typeof Home; title: string; desc: string }) {
  return (
    <Link href={href} className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>
      <p className="text-xs text-gray-500">{desc}</p>
    </Link>
  )
}
