import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import PropertyCard from "@/components/properties/PropertyCard"
import Navbar from "@/components/shared/Navbar"
import HomeSearch from "@/components/shared/HomeSearch"
import ServiceBanners from "@/components/shared/ServiceBanners"
import { ArrowRight, Shield, Bell, Users, PlusCircle, Sofa } from "lucide-react"

async function getStats() {
  const supabase = await createClient()
  const [{ count: totalBiens }, { count: totalTransactions }] = await Promise.all([
    supabase.from("properties").select("*", { count: "exact", head: true }).eq("statut", "publie"),
    supabase.from("transactions").select("*", { count: "exact", head: true }).eq("statut", "payee"),
  ])
  return { totalBiens: totalBiens ?? 0, totalTransactions: totalTransactions ?? 0 }
}

async function getRecentProperties() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("properties")
    .select("id,titre,type_offre,categorie,prix,quartier,statut,surface,nb_pieces,nb_chambres,nb_sdb,meuble,created_at,validated_at,property_media(url,type,ordre,thumbnail_url),zones(nom)")
    .eq("statut", "publie")
    .neq("type_offre", "residence_meublee") // les résidences ont leur propre espace
    .order("created_at", { ascending: false })
    .limit(6)
  return (data ?? []) as unknown[]
}

async function getResidences() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("properties")
    .select("*,property_media(url,type,ordre,thumbnail_url),zones(nom)")
    .eq("statut", "publie")
    .eq("type_offre", "residence_meublee")
    .order("created_at", { ascending: false })
  return (data ?? []) as unknown[]
}

async function getVilles() {
  const admin = createAdminClient()
  const { data } = await admin.from("villes").select("id,nom").eq("actif", true).order("ordre").order("nom")
  return (data ?? []) as { id: string; nom: string }[]
}

async function getServiceBanners() {
  const admin = createAdminClient()
  const { data } = await admin
    .from("service_banners")
    .select("id,titre,sous_titre,description,icone,couleur,cta_label,cta_lien")
    .eq("actif", true)
    .order("ordre")
  return (data ?? []) as {
    id: string; titre: string; sous_titre: string | null; description: string | null
    icone: string; couleur: string; cta_label: string | null; cta_lien: string | null
  }[]
}

export default async function Home() {
  const [stats, recentProperties, residences, villes, serviceBanners] = await Promise.all([
    getStats(), getRecentProperties(), getResidences(), getVilles(), getServiceBanners(),
  ])

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="relative bg-slate-950 overflow-hidden">
          {/* Dot pattern subtil */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='3' cy='3' r='1.5' fill='%23fff'/%3E%3Ccircle cx='15' cy='15' r='1.5' fill='%23fff'/%3E%3C/svg%3E\")",
            }}
          />
          {/* Lueurs de fond */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-700/20 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-8 md:pt-8 md:pb-10">
            {/* Badges communes actives */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {(villes.length > 0 ? villes : [{ id: "bk", nom: "Bouaké" }]).map(v => (
                <span key={v.id}
                  className="inline-flex items-center gap-1.5 text-slate-400 text-xs px-3 py-1.5 rounded-full border border-slate-700/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {v.nom}
                </span>
              ))}
              <span className="text-slate-600 text-xs">— Côte d&apos;Ivoire</span>
            </div>

            {/* Titre */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-[1.1] tracking-tight mb-4 max-w-2xl">
              L&apos;immobilier à Bouaké,{" "}
              <span className="text-amber-400">simplifié.</span>
            </h1>
            <p className="text-slate-400 text-sm md:text-base mb-6 max-w-lg leading-relaxed">
              Annonces vérifiées par nos agents. Location, vente, gestion de biens.
              Votre maison, entre de bonnes mains.
            </p>

            {/* Barre de recherche */}
            <HomeSearch villes={villes} />
          </div>
        </section>

        {/* ── STATS ────────────────────────────────────────────────────── */}
        <section className="border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="flex items-center divide-x divide-gray-100 overflow-x-auto">
              {[
                { value: stats.totalBiens || "—", label: "annonces vérifiées" },
                { value: "14", label: "quartiers couverts" },
                { value: stats.totalTransactions || "—", label: "transactions conclues" },
              ].map(s => (
                <div key={s.label} className="flex items-baseline gap-2 px-8 py-6 first:pl-0 last:pr-0 shrink-0">
                  <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                  <span className="text-sm text-slate-400">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ANNONCES RÉCENTES ────────────────────────────────────────── */}
        <section className="bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Annonces récentes</h2>
                <p className="text-sm text-slate-400 mt-1">Biens disponibles à la location et à la vente à Bouaké</p>
              </div>
              <Link href="/biens"
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800 shrink-0">
                Voir tout <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentProperties.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                <p className="text-4xl mb-3">🏗️</p>
                <p className="text-slate-400 text-sm">Les premières annonces arrivent bientôt.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {(recentProperties as { id: string }[]).map(p => (
                  <PropertyCard key={p.id} property={p as never} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── RÉSIDENCES MEUBLÉES (espace dédié, défilement horizontal) ──── */}
        {residences.length > 0 && (
          <section className="bg-gradient-to-br from-teal-50 to-white border-t border-teal-100">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
              <div className="flex items-end justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-teal-900 flex items-center gap-2">
                    <Sofa className="w-5 h-5 text-teal-600" /> Résidences meublées
                  </h2>
                  <p className="text-sm text-teal-700/70 mt-1">Appartements et studios meublés, disponibles à la réservation à Bouaké.</p>
                </div>
                <Link href="/residences"
                  className="flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800 shrink-0">
                  Voir tout <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Fil défilant : toutes les résidences de la base */}
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
                {(residences as { id: string }[]).map(p => (
                  <div key={p.id} className="w-72 shrink-0 snap-start">
                    <PropertyCard property={p as never} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── NOS SERVICES ─────────────────────────────────────────────── */}
        <ServiceBanners banners={serviceBanners} />

        {/* ── CTA PROPRIÉTAIRES ────────────────────────────────────────── */}
        <section className="bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
            <div className="bg-slate-950 rounded-2xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div className="max-w-lg">
                <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3">Pour les propriétaires</p>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-3 leading-snug">
                  Vous avez un bien à louer ou à vendre ?
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Publication gratuite. Nos agents vérifient, photographient et diffusent votre annonce
                  auprès de nos clients. Commission uniquement en cas de transaction réussie.
                </p>
              </div>
              <Link
                href="/publier"
                className="shrink-0 flex items-center gap-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold px-6 py-3.5 rounded-xl transition-colors text-sm whitespace-nowrap shadow-lg shadow-amber-400/20"
              >
                <PlusCircle className="w-4 h-4" />
                Publier une annonce
              </Link>
            </div>
          </div>
        </section>

        {/* ── POURQUOI INAYA ───────────────────────────────────────────── */}
        <section className="bg-slate-50 border-t border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Pourquoi choisir Inaya Immo ?</h2>
            <p className="text-slate-400 text-sm mb-10">La plateforme immobilière la plus fiable de Bouaké.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                {
                  icon: Shield,
                  title: "Annonces vérifiées",
                  desc: "Chaque annonce passe par notre équipe et notre IA avant d'être publiée. Zéro fausse annonce.",
                  accent: "bg-blue-50 text-blue-700",
                },
                {
                  icon: Bell,
                  title: "Alertes en temps réel",
                  desc: "Sauvegardez vos critères et recevez une alerte dès qu'un bien correspondant est disponible.",
                  accent: "bg-amber-50 text-amber-600",
                },
                {
                  icon: Users,
                  title: "Agents dédiés",
                  desc: "Nos agents vous accompagnent de la visite jusqu'à la signature. Disponibles 7j/7.",
                  accent: "bg-emerald-50 text-emerald-700",
                },
              ].map(({ icon: Icon, title, desc, accent }) => (
                <div key={title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm mb-2">{title}</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="bg-slate-950">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-extrabold">I</span>
                </div>
                <span className="text-white font-bold text-sm">Inaya Immo</span>
                <span className="text-slate-600 text-sm hidden sm:inline">· Bouaké, Côte d&apos;Ivoire</span>
              </div>
              <div className="flex items-center gap-6 text-xs text-slate-500">
                <Link href="/biens" className="hover:text-slate-300 transition-colors">Annonces</Link>
                <Link href="/publier" className="hover:text-slate-300 transition-colors">Publier</Link>
                <Link href="/connexion" className="hover:text-slate-300 transition-colors">Connexion</Link>
                <span>© {new Date().getFullYear()}</span>
              </div>
            </div>
          </div>
        </footer>

      </main>
    </>
  )
}
