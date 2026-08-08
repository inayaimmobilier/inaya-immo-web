import Link from "next/link"
import { redirect } from "next/navigation"
import { Phone, Search, KeyRound } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { etatCompte } from "@/lib/credits"

// ============================================================================
// CONTACTS DÉBLOQUÉS PAR LE PROFESSIONNEL.
//
// Ce qu'il a payé doit rester consultable indéfiniment, sans repasser par la
// fiche d'annonce : un contact acheté il y a trois semaines se retrouve ici, et
// même si l'annonce a été retirée entre-temps — le numéro est figé au moment de
// l'achat, précisément pour cela.
//
// C'est la SEULE liste d'annonces sur laquelle il a des informations privées.
// Partout ailleurs il voit le catalogue public, comme n'importe quel visiteur.
// ============================================================================

export const metadata = { title: "Mes contacts · Inaya Immo" }
export const dynamic = "force-dynamic"

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/agent/contacts")

  const compte = await etatCompte(user.id)
  const admin = createAdminClient()

  const { data: uRaw } = await admin.from("contact_unlocks")
    .select("id, property_id, cout, contact_telephone, contact_nom, contact_source, created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)
  const achats = (uRaw ?? []) as unknown as {
    id: string; property_id: string; cout: number
    contact_telephone: string; contact_nom: string | null; contact_source: string; created_at: string
  }[]

  // Titres des annonces en une seule requête. Une annonce supprimée depuis
  // l'achat n'est pas une erreur : le contact reste dû.
  const ids = achats.map(a => a.property_id)
  const { data: pRaw } = ids.length
    ? await admin.from("properties").select("id, titre, reference, quartier, ville, prix, type_offre").in("id", ids)
    : { data: [] }
  const biens = new Map(
    ((pRaw ?? []) as unknown as { id: string; titre: string; reference: number | null; quartier: string | null; ville: string | null; prix: number | null; type_offre: string }[])
      .map(p => [p.id, p]))

  const totalDepense = achats.reduce((s, a) => s + a.cout, 0)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Carte titre="Solde" valeur={compte.actif ? compte.solde.toLocaleString("fr-FR") : "—"} suffixe="crédits" />
        <Carte titre="Contacts obtenus" valeur={achats.length.toString()} />
        <Carte titre="Crédits dépensés" valeur={totalDepense.toLocaleString("fr-FR")} />
      </div>

      {!compte.actif && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Compte professionnel non activé
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            Contactez Inaya pour ouvrir votre compte et le recharger. Vous pourrez alors obtenir
            le contact rattaché à n&apos;importe quelle annonce du catalogue.
          </p>
        </div>
      )}

      {/* La recherche est mise en avant : c'est le geste quotidien d'un
          professionnel — trouver un bien à proposer à son client. */}
      <Link href="/biens"
        className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 transition hover:border-blue-400">
        <Search className="h-5 w-5 shrink-0 text-blue-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-900">Chercher un bien pour un client</p>
          <p className="text-xs text-blue-800">
            Tout le catalogue vous est ouvert — location, vente, terrains, résidences.
          </p>
        </div>
      </Link>

      {achats.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          Vous n&apos;avez encore débloqué aucun contact.
        </p>
      ) : (
        <div className="space-y-3">
          {achats.map(a => {
            const b = biens.get(a.property_id)
            return (
              <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    {b ? (
                      <Link href={`/biens/${a.property_id}`} className="font-semibold text-gray-900 hover:text-blue-700">
                        {b.titre}
                      </Link>
                    ) : (
                      // L'annonce a disparu : on le dit, sans laisser croire à un bogue.
                      <p className="font-semibold text-gray-500">Annonce retirée du catalogue</p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[b?.quartier, b?.ville].filter(Boolean).join(", ") || "—"}
                      {b?.prix ? ` · ${b.prix.toLocaleString("fr-FR")} FCFA` : ""}
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                      {a.contact_source === "proprietaire" ? "Propriétaire" : "Diffuseur de l'annonce"}
                    </p>
                    <p className="text-sm text-gray-900">{a.contact_nom || "Contact"}</p>
                  </div>

                  <div className="text-right">
                    <a href={`tel:${a.contact_telephone}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800">
                      <Phone className="h-4 w-4" /> {a.contact_telephone}
                    </a>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {a.cout.toLocaleString("fr-FR")} crédits ·{" "}
                      {new Date(a.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Carte({ titre, valeur, suffixe }: { titre: string; valeur: string; suffixe?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{titre}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {valeur}{suffixe && <span className="ml-1 text-xs font-medium text-gray-500">{suffixe}</span>}
      </p>
    </div>
  )
}
