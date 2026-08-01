import Link from "next/link"
import { Clock, AlertTriangle, Users, Inbox } from "lucide-react"
import { fileModeration, perfAgents, suiviLeads } from "@/lib/suivi"

// ============================================================================
// Pilotage : ce qui attend, et depuis quand.
// Un compteur sans âge ne déclenche aucune action — c'est pourquoi cette page
// met le temps d'attente au premier plan, pas le volume.
// ============================================================================
export const dynamic = "force-dynamic"
export const metadata = { title: "Pilotage · Inaya Immo" }

/** « 351 h » se lit mal ; « 14 j 15 h » se comprend d'un coup d'œil. */
function duree(h: number): string {
  if (h < 1) return "moins d'une heure"
  if (h < 48) return `${h} h`
  const j = Math.floor(h / 24)
  const reste = h % 24
  return reste ? `${j} j ${reste} h` : `${j} j`
}

function Carte({ valeur, libelle, ton = "neutre", indice }: {
  valeur: string; libelle: string; ton?: "neutre" | "alerte" | "grave"; indice?: string
}) {
  const couleur = ton === "grave" ? "text-red-600" : ton === "alerte" ? "text-amber-600" : "text-gray-900"
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className={`text-3xl font-bold ${couleur}`}>{valeur}</p>
      <p className="text-sm text-gray-600 mt-1">{libelle}</p>
      {indice && <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{indice}</p>}
    </div>
  )
}

export default async function PilotagePage() {
  const [moderation, leads, agents] = await Promise.all([
    fileModeration(), suiviLeads(), perfAgents(),
  ])

  const anciennete = moderation.plusAncienneHeures
  const tonAge = anciennete == null ? "neutre" : anciennete > 72 ? "grave" : anciennete > 24 ? "alerte" : "neutre"

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pilotage</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
          Ce qui attend une action, et depuis combien de temps. Le volume seul ne dit rien :
          quarante annonces arrivées ce matin ne posent aucun problème, une seule oubliée
          depuis deux semaines en pose un.
        </p>
      </div>

      {/* ── Modération ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Inbox className="w-4 h-4 text-blue-600" /> Annonces à valider
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Carte valeur={String(moderation.total)} libelle="en attente" />
          <Carte
            valeur={anciennete == null ? "—" : duree(anciennete)}
            libelle="la plus ancienne"
            ton={tonAge}
            indice={anciennete != null && anciennete > 72 ? "Un annonceur qui attend si longtemps ne revient pas." : undefined}
          />
          <Carte valeur={String(moderation.au48h)} libelle="au-delà de 48 h" ton={moderation.au48h > 0 ? "alerte" : "neutre"} />
          <Carte valeur={String(moderation.au72h)} libelle="au-delà de 72 h" ton={moderation.au72h > 0 ? "grave" : "neutre"} />
        </div>

        {moderation.echantillon.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <p className="px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">
              Les plus anciennes — à traiter en premier
            </p>
            <ul className="divide-y divide-gray-100">
              {moderation.echantillon.map(a => (
                <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                    N°{a.reference ?? "—"}
                  </span>
                  <Link href={`/admin/annonces/${a.id}`} className="flex-1 text-sm text-gray-900 hover:text-blue-700 truncate">
                    {a.titre}
                  </Link>
                  <span className={`text-xs flex items-center gap-1 flex-shrink-0 ${a.heures > 72 ? "text-red-600 font-medium" : "text-gray-500"}`}>
                    <Clock className="w-3 h-3" /> {duree(a.heures)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Demandes ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Demandes des clients
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Carte valeur={String(leads.ouverts)} libelle="dossiers ouverts" />
          <Carte valeur={String(leads.sansAgent)} libelle="sans agent assigné" ton={leads.sansAgent > 0 ? "alerte" : "neutre"} />
          <Carte valeur={String(leads.jamaisRelances)} libelle="jamais relancés" ton={leads.jamaisRelances > 0 ? "alerte" : "neutre"} />
          <Carte valeur={String(leads.total)} libelle="reçus sur 90 jours" />
        </div>

        {leads.urgents.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <p className="px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">
              En attente de prise en charge
            </p>
            <ul className="divide-y divide-gray-100">
              {leads.urgents.map(l => (
                <li key={l.id} className="px-5 py-3 flex items-center gap-3">
                  <Link href={`/admin/leads/${l.id}`} className="flex-1 text-sm text-gray-900 hover:text-blue-700 truncate">
                    {l.nom || "Client sans nom"}
                  </Link>
                  <span className="text-xs text-gray-400">{l.statut}</span>
                  <span className={`text-xs flex items-center gap-1 ${l.heures > 24 ? "text-red-600 font-medium" : "text-gray-500"}`}>
                    <Clock className="w-3 h-3" /> {duree(l.heures)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Agents ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" /> Charge par agent
        </h2>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-5">
            Aucune demande assignée sur les 90 derniers jours. Ce tableau se remplira à mesure
            que les prises de contact arrivent.
          </p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Assignées</th>
                  <th className="px-5 py-3 font-medium">Ouvertes</th>
                  <th className="px-5 py-3 font-medium">Conclues</th>
                  <th className="px-5 py-3 font-medium">Délai de prise en charge</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-gray-900">{a.nom}</td>
                    <td className="px-5 py-3 tabular-nums">{a.assignes}</td>
                    <td className="px-5 py-3 tabular-nums">{a.ouverts}</td>
                    <td className="px-5 py-3 tabular-nums text-green-700">{a.conclus}</td>
                    <td className="px-5 py-3 tabular-nums text-gray-600">
                      {a.delaiMoyenH == null ? "—" : duree(a.delaiMoyenH)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
