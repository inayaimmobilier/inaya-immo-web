import Link from "next/link"
import { MessageCircle, ArrowLeft, Home } from "lucide-react"
import { candidatsMeubles, pitchWhatsApp } from "@/lib/meublee-prospection"
import { formatPrix } from "@/lib/utils"
import ConvertirButton from "./ConvertirButton"

// ============================================================================
// Démarchage des meublées : les annonces déjà publiées qui décrivent un meublé
// sans porter ce type. Chacune est un propriétaire à appeler, pas une piste
// froide — il nous a déjà confié un bien.
// ============================================================================
export const dynamic = "force-dynamic"

/** Numéro ivoirien vers le format wa.me (international sans « + »). */
function waNumero(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("225")) return d
  if (d.length === 10 && d.startsWith("0")) return `225${d}`
  return d
}

export default async function ProspectionMeublees() {
  const candidats = await candidatsMeubles()

  const parQuartier = new Map<string, number>()
  for (const c of candidats) {
    const cle = [c.quartier, c.ville].filter(Boolean).join(", ") || "Non précisé"
    parQuartier.set(cle, (parQuartier.get(cle) ?? 0) + 1)
  }
  const zones = [...parQuartier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <Link href="/admin/residences" className="text-xs text-gray-500 hover:text-blue-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Résidences meublées
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Démarchage — meublés à convertir</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
          Ces annonces publiées décrivent un bien meublé sans porter le type
          « résidence meublée ». Elles n&apos;apparaissent donc ni dans l&apos;onglet dédié de
          l&apos;application, ni dans l&apos;espace de réservation. Chaque ligne est un propriétaire
          qui vous a déjà confié un bien.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-baseline gap-3">
          <p className="text-3xl font-bold text-gray-900">{candidats.length}</p>
          <p className="text-sm text-gray-500">candidats identifiés</p>
        </div>
        {zones.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {zones.map(([z, n]) => (
              <span key={z} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-full px-3 py-1">
                {z} <strong className="text-gray-900">{n}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {candidats.length === 0 ? (
        <p className="text-gray-500">Aucun candidat pour le moment.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {candidats.map(c => {
              const lieu = [c.quartier, c.ville].filter(Boolean).join(", ")
              const wa = c.publieur_tel
                ? `https://wa.me/${waNumero(c.publieur_tel)}?text=${encodeURIComponent(pitchWhatsApp(c))}`
                : null
              return (
                <li key={c.id} className="px-5 py-4 flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        N°{c.reference ?? "—"}
                      </span>
                      <Link href={`/admin/annonces/${c.id}`} className="font-semibold text-sm text-gray-900 hover:text-blue-700">
                        {c.titre}
                      </Link>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {c.categorie} · {lieu || "lieu non précisé"} · {c.prix ? `${formatPrix(c.prix)} FCFA` : "prix sur demande"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.publieur_nom || "Publieur inconnu"}
                      {c.publieur_tel ? ` · ${c.publieur_tel}` : " · aucun numéro enregistré"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg">
                        <MessageCircle className="w-3.5 h-3.5" /> Démarcher
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Pas de numéro</span>
                    )}
                    <ConvertirButton propertyId={c.id} reference={c.reference} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
        <Home className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        La conversion garde le tarif saisi par l&apos;annonceur et pose la période sur
        « mois ». On ne déduit pas un prix à la nuitée depuis un loyer mensuel : ce serait
        afficher un montant faux. Ajustez après accord avec le propriétaire.
      </p>
    </div>
  )
}
