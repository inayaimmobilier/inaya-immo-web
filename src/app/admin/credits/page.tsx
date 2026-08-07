import { redirect } from "next/navigation"
import { Wallet } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { UserRole } from "@/types/database"
import CreditsManager, {
  type LigneCompte, type LigneTarif, type LigneReclamation, type LigneRetrait,
} from "./CreditsManager"

// ============================================================================
// ADMINISTRATION DES CRÉDITS PROFESSIONNELS.
//
// Quatre choses au même endroit, parce qu'elles se pilotent ensemble : les
// comptes et leur solde, la grille tarifaire, les réclamations à trancher, et
// les numéros retirés de la diffusion.
//
// Réservé à `super_admin` et `admin` : cette page ouvre la caisse.
// ============================================================================

export const metadata = { title: "Crédits professionnels · Inaya Immo" }
export const dynamic = "force-dynamic"

const CAISSE: UserRole[] = ["super_admin", "admin"]

export default async function CreditsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion")
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof as { role: UserRole } | null)?.role
  if (!role || !CAISSE.includes(role)) redirect("/admin")

  const admin = createAdminClient()

  // ── Comptes ouverts ──────────────────────────────────────────────────────
  const { data: wRaw } = await admin.from("credit_wallets")
    .select("user_id, solde, suspendu, created_at").order("solde", { ascending: false })
  const wallets = (wRaw ?? []) as unknown as
    { user_id: string; solde: number; suspendu: boolean; created_at: string }[]

  // Profils en une seule requête plutôt qu'une par compte.
  const ids = wallets.map(w => w.user_id)
  const { data: pRaw } = ids.length
    ? await admin.from("profiles").select("id, nom, prenom, telephone, email, role").in("id", ids)
    : { data: [] }
  const profils = new Map(
    ((pRaw ?? []) as unknown as { id: string; nom: string | null; prenom: string | null; telephone: string | null; email: string | null; role: string }[])
      .map(p => [p.id, p]))

  // Dépense de chaque compte : ce qu'il a réellement rapporté.
  const { data: uRaw } = await admin.from("contact_unlocks").select("user_id, cout")
  const depense = new Map<string, { n: number; total: number }>()
  for (const u of ((uRaw ?? []) as unknown as { user_id: string; cout: number }[])) {
    const d = depense.get(u.user_id) ?? { n: 0, total: 0 }
    d.n += 1; d.total += u.cout
    depense.set(u.user_id, d)
  }

  const comptes: LigneCompte[] = wallets.map(w => {
    const p = profils.get(w.user_id)
    const d = depense.get(w.user_id) ?? { n: 0, total: 0 }
    return {
      userId: w.user_id,
      nom: [p?.prenom, p?.nom].filter(Boolean).join(" ") || "—",
      contact: p?.telephone || p?.email || "—",
      role: p?.role ?? "—",
      solde: w.solde,
      suspendu: w.suspendu,
      achats: d.n,
      depense: d.total,
      depuis: w.created_at,
    }
  })

  // ── Grille tarifaire ─────────────────────────────────────────────────────
  const { data: tRaw } = await admin.from("credit_tarifs")
    .select("*").order("type_offre").order("categorie", { nullsFirst: true })
  const tarifs = (tRaw ?? []) as unknown as LigneTarif[]

  // ── Réclamations ouvertes d'abord : ce sont elles qui attendent ──────────
  const { data: rRaw } = await admin.from("contact_reclamations")
    .select("id, unlock_id, user_id, motif, statut, decision_note, created_at")
    .order("created_at", { ascending: false }).limit(100)
  const recBrutes = (rRaw ?? []) as unknown as
    { id: string; unlock_id: string; user_id: string; motif: string; statut: string; decision_note: string | null; created_at: string }[]

  const unlockIds = recBrutes.map(r => r.unlock_id)
  const { data: unRaw } = unlockIds.length
    ? await admin.from("contact_unlocks").select("id, cout, contact_telephone, contact_source, property_id").in("id", unlockIds)
    : { data: [] }
  const unlocks = new Map(
    ((unRaw ?? []) as unknown as { id: string; cout: number; contact_telephone: string; contact_source: string; property_id: string }[])
      .map(u => [u.id, u]))

  const recIds = [...new Set(recBrutes.map(r => r.user_id))]
  const { data: rpRaw } = recIds.length
    ? await admin.from("profiles").select("id, nom, prenom").in("id", recIds)
    : { data: [] }
  const recProfils = new Map(
    ((rpRaw ?? []) as unknown as { id: string; nom: string | null; prenom: string | null }[])
      .map(p => [p.id, [p.prenom, p.nom].filter(Boolean).join(" ") || "—"]))

  const reclamations: LigneReclamation[] = recBrutes.map(r => {
    const u = unlocks.get(r.unlock_id)
    return {
      id: r.id,
      professionnel: recProfils.get(r.user_id) ?? "—",
      motif: r.motif,
      statut: r.statut,
      note: r.decision_note,
      cout: u?.cout ?? 0,
      telephone: u?.contact_telephone ?? "—",
      source: u?.contact_source ?? "—",
      propertyId: u?.property_id ?? null,
      date: r.created_at,
    }
  }).sort((a, b) => (a.statut === "ouverte" ? -1 : 1) - (b.statut === "ouverte" ? -1 : 1))

  // ── Numéros retirés de la diffusion ──────────────────────────────────────
  const { data: oRaw } = await admin.from("contact_opt_out")
    .select("telephone, motif, created_at").order("created_at", { ascending: false }).limit(200)
  const retraits = (oRaw ?? []) as unknown as LigneRetrait[]

  const total = comptes.reduce((s, c) => s + c.solde, 0)
  const encaisse = comptes.reduce((s, c) => s + c.depense, 0)

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-blue-600" /> Crédits professionnels
        </h1>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Un professionnel dépense des crédits pour obtenir le contact rattaché à une annonce.
          <strong> 1 crédit = 1 FCFA.</strong> Ouvrir un compte, c&apos;est autoriser quelqu&apos;un
          à acheter : ne le faites qu&apos;après avoir vérifié l&apos;agence.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Chiffre libelle="Comptes ouverts" valeur={comptes.length.toString()} />
        <Chiffre libelle="Crédits en circulation" valeur={total.toLocaleString("fr-FR")} />
        <Chiffre libelle="Crédits consommés" valeur={encaisse.toLocaleString("fr-FR")} />
      </div>

      <CreditsManager
        comptes={comptes}
        tarifs={tarifs}
        reclamations={reclamations}
        retraits={retraits}
      />
    </div>
  )
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{libelle}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{valeur}</p>
    </div>
  )
}
