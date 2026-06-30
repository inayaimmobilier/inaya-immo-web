import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Sofa, Pencil, MessageCircle, MessageSquare, Phone, Mail, CheckCircle2, XCircle, Clock, Receipt, CalendarCheck } from "lucide-react"
import { formatPrix, STATUT_LABEL } from "@/lib/utils"
import { estimateSejour, nuitsFromSejour } from "@/lib/residence-pricing"
import type { UserRole } from "@/types/database"
import DisponibiliteToggle from "./DisponibiliteToggle"
import DeleteResidenceButton from "./DeleteResidenceButton"
import { confirmerReservation, annulerReservation } from "./actions"
import { Plus } from "lucide-react"

export const metadata = { title: "Résidences meublées · Inaya Immo" }

interface PageProps { searchParams: Promise<{ vue?: string }> }

interface Row {
  id: string; titre: string; quartier: string | null; ville: string | null
  prix: number | null; tarif_periode: string | null; statut: string; disponible: boolean
}
interface Resa {
  id: string; contact_nom: string | null; contact_telephone: string | null; contact_email: string | null
  creneaux: { souhaite?: string }[] | null; statut: string; validation_proprietaire: string | null
  sejour_nuits: number | null; montant_estime: number | null; created_at: string
  properties: ResaProp | ResaProp[] | null
}
interface ResaProp { titre: string; prix: number | null; tarif_periode: string | null; description: string | null; forfaits: string | null }

const PERIODE: Record<string, string> = { nuit: "/nuit", semaine: "/sem.", mois: "/mois" }
const VALID_BADGE: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-50 text-amber-700 border-amber-100" },
  confirme:   { label: "Confirmée", cls: "bg-green-50 text-green-700 border-green-100" },
  refuse:     { label: "Annulée", cls: "bg-red-50 text-red-700 border-red-100" },
}

export default async function AdminResidencesPage({ searchParams }: PageProps) {
  const { vue } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/residences")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const role = (meData as { role: UserRole } | null)?.role ?? "client"
  if (!["super_admin", "admin", "moderateur", "agent"].includes(role)) redirect("/admin/dashboard")

  const admin = createAdminClient()
  const [{ data: resData }, { data: resaData }, { data: setData }] = await Promise.all([
    admin.from("properties").select("*").eq("type_offre", "residence_meublee").order("created_at", { ascending: false }),
    admin.from("leads").select("*, properties!inner(*)").eq("properties.type_offre", "residence_meublee").order("created_at", { ascending: false }).limit(100),
    admin.from("app_settings").select("value").eq("key", "commission_residence_pct").maybeSingle(),
  ])

  const residences = ((resData ?? []) as Row[]).map(r => ({ ...r, disponible: r.disponible !== false }))
  const reservations = (resaData ?? []) as Resa[]
  const pct = Number((setData as { value: unknown } | null)?.value) || 10

  const propOf = (r: Resa): ResaProp | null => (Array.isArray(r.properties) ? r.properties[0] : r.properties) ?? null
  const propTitre = (r: Resa) => propOf(r)?.titre ?? "—"
  // Montant : valeur stockée si dispo (migration 022), sinon calculée depuis les dates + tarif + forfaits.
  const montantOf = (r: Resa): number => {
    if (r.montant_estime) return r.montant_estime
    const p = propOf(r)
    if (!p?.prix) return 0
    const nuits = r.sejour_nuits ?? nuitsFromSejour(r.creneaux?.[0]?.souhaite)
    return estimateSejour(nuits, p.prix, p.tarif_periode, p.forfaits ?? p.description)?.total ?? 0
  }

  const dispoCount = residences.filter(r => r.disponible && r.statut === "publie").length
  const enAttente = reservations.filter(r => (r.validation_proprietaire ?? "en_attente") === "en_attente").length
  const confirmees = reservations.filter(r => r.validation_proprietaire === "confirme")
  const commissionTotale = confirmees.reduce((s, r) => s + montantOf(r) * pct / 100, 0)

  const onglet = vue === "residences" ? "residences" : "reservations"

  const stat = (label: string, value: string, Icon: typeof Sofa, color: string) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
      <div><p className="text-lg font-bold text-gray-900 leading-tight">{value}</p><p className="text-xs text-gray-400">{label}</p></div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sofa className="w-6 h-6 text-teal-600" /> Résidences meublées
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestion des résidences, des réservations et des commissions.</p>
      </div>

      {/* Vue d'ensemble */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat("Résidences (dispo / total)", `${dispoCount} / ${residences.length}`, Sofa, "bg-teal-50 text-teal-600")}
        {stat("Réservations en attente", String(enAttente), Clock, "bg-amber-50 text-amber-600")}
        {stat("Réservations confirmées", String(confirmees.length), CalendarCheck, "bg-green-50 text-green-600")}
        {stat(`Commission estimée (${pct}%)`, `${formatPrix(commissionTotale)}`, Receipt, "bg-blue-50 text-blue-600")}
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        <Link href="/admin/residences"
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
            onglet === "reservations" ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"}`}>
          Réservations ({reservations.length})
        </Link>
        <Link href="/admin/residences?vue=residences"
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
            onglet === "residences" ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"}`}>
          Les résidences ({residences.length})
        </Link>
      </div>

      {/* ── Onglet Réservations ─────────────────────────────────────────── */}
      {onglet === "reservations" && (
        reservations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-12 text-sm text-gray-500">
            Aucune réservation pour le moment.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Client &amp; contact</th>
                  <th className="px-4 py-3 font-medium">Résidence</th>
                  <th className="px-4 py-3 font-medium">Séjour</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Commission</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reservations.map(r => {
                  const v = r.validation_proprietaire ?? "en_attente"
                  const badge = VALID_BADGE[v] ?? VALID_BADGE.en_attente
                  const sejour = r.creneaux?.[0]?.souhaite ?? "—"
                  const tel = r.contact_telephone?.replace(/\D/g, "") ?? ""
                  const montant = montantOf(r)
                  const commission = montant * pct / 100
                  const waMsg = encodeURIComponent(`Bonjour ${r.contact_nom || ""}, ici Inaya Immo au sujet de votre réservation de « ${propTitre(r)} » (${sejour}).`)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.contact_nom || "Client"}</p>
                        {r.contact_telephone && <p className="text-xs text-gray-400 mt-0.5">{r.contact_telephone}</p>}
                        {/* Boutons de contact direct */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {tel && (
                            <>
                              <a href={`https://wa.me/${tel}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg">
                                <MessageCircle className="w-3 h-3" /> WhatsApp
                              </a>
                              <a href={`sms:${r.contact_telephone}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                                <MessageSquare className="w-3 h-3" /> SMS
                              </a>
                              <a href={`tel:${r.contact_telephone}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg">
                                <Phone className="w-3 h-3" /> Appeler
                              </a>
                            </>
                          )}
                          {r.contact_email && (
                            <a href={`mailto:${r.contact_email}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg">
                              <Mail className="w-3 h-3" /> E-mail
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{propTitre(r)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {sejour}
                        {r.sejour_nuits ? <span className="block text-xs text-gray-400">{r.sejour_nuits} nuit{r.sejour_nuits > 1 ? "s" : ""}</span> : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{montant ? `${formatPrix(montant)} F` : "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-teal-700">{montant ? `${formatPrix(commission)} F` : "—"}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {v !== "confirme" && (
                          <form action={confirmerReservation} className="inline">
                            <input type="hidden" name="lead_id" value={r.id} />
                            <button className="inline-flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg mr-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmer
                            </button>
                          </form>
                        )}
                        {v !== "refuse" && (
                          <form action={annulerReservation} className="inline">
                            <input type="hidden" name="lead_id" value={r.id} />
                            <button className="inline-flex items-center gap-1 text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg">
                              <XCircle className="w-3.5 h-3.5" /> Annuler
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Onglet Résidences ───────────────────────────────────────────── */}
      {onglet === "residences" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link href="/residences/publier"
              className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
              <Plus className="w-4 h-4" /> Ajouter une résidence
            </Link>
          </div>
        {residences.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-12 text-sm text-gray-500">
            Aucune résidence meublée enregistrée.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Résidence</th>
                  <th className="px-4 py-3 font-medium">Tarif</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Disponibilité</th>
                  <th className="px-4 py-3 font-medium text-right">Gérer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {residences.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.titre}</p>
                      <p className="text-xs text-gray-400">{[r.quartier, r.ville].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {r.prix ? `${formatPrix(r.prix)} ${PERIODE[r.tarif_periode ?? "mois"] ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-500">{STATUT_LABEL[r.statut] ?? r.statut}</span></td>
                    <td className="px-4 py-3">
                      {r.statut === "publie"
                        ? <DisponibiliteToggle propertyId={r.id} initial={r.disponible} />
                        : <span className="text-xs text-amber-600">à valider d&apos;abord</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/annonces/${r.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 mr-3">
                        <Pencil className="w-3.5 h-3.5" /> Modifier
                      </Link>
                      <DeleteResidenceButton propertyId={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Édition, photos, validation et suppression : depuis « Modifier ». Le taux de commission se règle dans{" "}
        <Link href="/admin/parametres" className="text-blue-600 hover:underline">Paramètres</Link>.
      </p>
    </div>
  )
}
