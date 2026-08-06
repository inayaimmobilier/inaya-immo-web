import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Home, MessageSquare, Wallet, Clock, AlertCircle, Eye, Users, MessageCircle, Smartphone } from "lucide-react"
import { formatPrix } from "@/lib/utils"
import AutoRefresh from "@/components/shared/AutoRefresh"

// Données temps réel (ingestion WhatsApp) : jamais de cache, toujours frais.
export const dynamic = "force-dynamic"

/**
 * Prises de contact (clics WhatsApp / appel sur une annonce) sur 24 h / 7 j / 30 j,
 * en distinguant celles où le visiteur a laissé son numéro. C'est le chaînon qui
 * manquait entre « pages vues » et « demandes reçues ».
 */
async function getContactStats() {
  const vide = { total: 0, identifies: 0 }
  const empty = { j1: { ...vide }, j7: { ...vide }, j30: { ...vide } }
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 30 * 86400_000).toISOString()
    const { data, error } = await admin.from("contact_clicks")
      .select("created_at,avec_contact")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000)
    if (error) { console.error("INAYA-STATS-CONTACTS", error.message); return empty }
    const rows = (data ?? []) as { created_at: string; avec_contact: boolean }[]
    const agg = (ms: number) => {
      const cut = Date.now() - ms
      const r = rows.filter(x => new Date(x.created_at).getTime() >= cut)
      return { total: r.length, identifies: r.filter(x => x.avec_contact).length }
    }
    return { j1: agg(86400_000), j7: agg(7 * 86400_000), j30: agg(30 * 86400_000) }
  } catch { return empty }
}

/**
 * TÉLÉCHARGEMENTS de l'application depuis le site, sur 24 h / 7 j / 30 j.
 *
 * L'application n'étant pas sur le Play Store, le site est le seul canal de
 * distribution : sans ce chiffre, impossible de savoir si la bannière sert à
 * quelque chose. On compte les clics ET les personnes distinctes — dix clics
 * du même visiteur ne font pas dix installations.
 */
async function getTelechargements() {
  const vide = { j1: { c: 0, v: 0 }, j7: { c: 0, v: 0 }, j30: { c: 0, v: 0 } }
  try {
    const { data } = await createAdminClient().from("page_views")
      .select("visitor_id, created_at")
      .eq("path", "/telechargement-app")
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .range(0, 4999)
    const lignes = (data ?? []) as { visitor_id: string | null; created_at: string }[]
    const agg = (ms: number) => {
      const seuil = Date.now() - ms
      const dans = lignes.filter(l => new Date(l.created_at).getTime() >= seuil)
      return { c: dans.length, v: new Set(dans.map(l => l.visitor_id ?? Math.random())).size }
    }
    return { j1: agg(86400_000), j7: agg(7 * 86400_000), j30: agg(30 * 86400_000) }
  } catch { return vide }
}

/**
 * Fréquentation du site (visiteurs uniques + pages vues) sur 24 h / 7 j / 30 j.
 * Lecture via le client ADMIN (la table page_views est en RLS, aucune lecture
 * publique). Best-effort : table absente (migration 043) → tout à zéro.
 */
async function getVisitStats() {
  const empty = { j1: { v: 0, p: 0 }, j7: { v: 0, p: 0 }, j30: { v: 0, p: 0 } }
  try {
    const admin = createAdminClient()
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()

    // ATTENTION : PostgREST PLAFONNE le nombre de lignes (1000 par défaut) — le
    // `.limit(50000)` ne lève pas ce plafond. Sans `order`, on recevait donc les
    // 1000 lignes les PLUS ANCIENNES : les visites du jour n'y figuraient jamais
    // et le compteur 24 h affichait 0 alors que le site était visité (bug réel
    // constaté le 2026-07-29 : 1177 vues sur 30 j, 55 sur 24 h, toutes ignorées).
    // On pagine donc explicitement, du PLUS RÉCENT au plus ancien.
    const PAGE = 1000
    const MAX_PAGES = 30            // jusqu'à 30 000 vues sur la fenêtre
    const rows: { visitor_id: string; created_at: string }[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await admin.from("page_views")
        .select("visitor_id, created_at")
        .gte("created_at", since30)
        // Le clic « Télécharger » est enregistré comme une vue de chemin
        // dédié : l'inclure gonflerait la fréquentation d'une ligne par
        // téléchargement, alors que ce n'est pas une page consultée.
        .neq("path", "/telechargement-app")
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) { console.error("INAYA-STATS-VIEWS", error.message); break }
      const batch = (data ?? []) as { visitor_id: string; created_at: string }[]
      rows.push(...batch)
      if (batch.length < PAGE) break   // dernière page atteinte
    }
    if (rows.length === 0) return empty

    const now = Date.now()
    const agg = (ms: number) => {
      const cut = now - ms
      const set = new Set<string>()
      let p = 0
      for (const r of rows) {
        if (new Date(r.created_at).getTime() >= cut) { set.add(r.visitor_id); p++ }
      }
      return { v: set.size, p }
    }
    return { j1: agg(86400_000), j7: agg(7 * 86400_000), j30: agg(30 * 86400_000) }
  } catch (e) {
    console.error("INAYA-STATS-VIEWS-002", (e as Error).message)
    return empty
  }
}

async function getDashboardStats() {
  const supabase = await createClient()

  const [
    { count: totalPublies },
    { count: enAttente },
    { count: leads30j },
    { count: transactionsMois },
    { data: lastProperties },
    { data: lastLeads },
  ] = await Promise.all([
    supabase.from("properties").select("*", { count: "exact", head: true }).eq("statut", "publie"),
    supabase.from("properties").select("*", { count: "exact", head: true }).eq("statut", "en_attente_validation"),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
    supabase.from("transactions").select("*", { count: "exact", head: true })
      .eq("statut", "payee")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from("properties").select("id,titre,statut,type_offre,categorie,prix,quartier,created_at")
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("leads").select("id,canal,statut,created_at,message,properties(titre)")
      .order("created_at", { ascending: false }).limit(5),
  ])

  return {
    totalPublies: totalPublies ?? 0,
    enAttente: enAttente ?? 0,
    leads30j: leads30j ?? 0,
    transactionsMois: transactionsMois ?? 0,
    lastProperties: lastProperties ?? [],
    lastLeads: lastLeads ?? [],
  }
}

// Pastilles + libellés alignés sur les enums réels du schéma
// (property_status & lead_status). 'conclu' est commun aux deux.
const STATUT_PILL: Record<string, string> = {
  // property_status
  brouillon:             "bg-gray-100 text-gray-500",
  en_attente_validation: "bg-amber-50 text-amber-700",
  publie:                "bg-green-50 text-green-700",
  reserve:               "bg-indigo-50 text-indigo-700",
  rejete:                "bg-red-50 text-red-700",
  expire:                "bg-gray-100 text-gray-400",
  suspendu:              "bg-orange-50 text-orange-700",
  // lead_status
  nouveau:               "bg-blue-50 text-blue-700",
  en_traitement:         "bg-indigo-50 text-indigo-700",
  contacte:              "bg-cyan-50 text-cyan-700",
  visite_planifiee:      "bg-violet-50 text-violet-700",
  visite_effectuee:      "bg-teal-50 text-teal-700",
  abandonne:             "bg-gray-100 text-gray-500",
  // commun
  conclu:                "bg-purple-50 text-purple-700",
}

const STATUT_LABEL_DASH: Record<string, string> = {
  brouillon: "Brouillon",
  en_attente_validation: "En attente",
  publie: "Publiée",
  reserve: "Réservée",
  rejete: "Rejetée",
  expire: "Expirée",
  suspendu: "Suspendue",
  nouveau: "Nouveau",
  en_traitement: "En traitement",
  contacte: "Contacté",
  visite_planifiee: "Visite planifiée",
  visite_effectuee: "Visite effectuée",
  abandonne: "Abandonné",
  conclu: "Conclu",
}

export default async function DashboardPage() {
  const [stats, visits, contacts, apk] = await Promise.all([
    getDashboardStats(), getVisitStats(), getContactStats(), getTelechargements(),
  ])

  const kpis = [
    {
      icon: Home,
      label: "Annonces publiées",
      value: stats.totalPublies,
      color: "blue",
      href: "/admin/annonces?statut=publie",
    },
    {
      icon: Clock,
      label: "En attente de validation",
      value: stats.enAttente,
      color: "amber",
      href: "/admin/annonces?statut=en_attente_validation",
      urgent: stats.enAttente > 0,
    },
    {
      icon: MessageSquare,
      label: "Leads (30 derniers jours)",
      value: stats.leads30j,
      color: "indigo",
      href: "/admin/leads",
    },
    {
      icon: Wallet,
      label: "Transactions ce mois",
      value: stats.transactionsMois,
      color: "green",
      href: "/admin/transactions",
    },
  ]

  const colorMap: Record<string, string> = {
    blue:   "bg-blue-50 text-blue-600",
    amber:  "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
    green:  "bg-green-50 text-green-600",
  }

  return (
    <div className="p-6 space-y-8">
      <AutoRefresh intervalMs={45_000} />
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Vue d&apos;ensemble de la plateforme Inaya Immo</p>
      </div>

      {/* Fréquentation du site */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-600" /> Fréquentation du site
          </h2>
          <span className="text-[11px] text-gray-400">Visiteurs uniques · Pages vues</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {([
            { label: "Aujourd'hui (24 h)", d: visits.j1 },
            { label: "7 derniers jours", d: visits.j7 },
            { label: "30 derniers jours", d: visits.j30 },
          ]).map(({ label, d }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-1.5">
                <Users className="w-5 h-5 text-blue-500" /> {d.v.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-gray-500 mt-1">{d.p.toLocaleString("fr-FR")} pages vues</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Téléchargements de l'application : le site est le seul canal de
            distribution tant qu'elle n'est pas sur le Play Store. */}
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
          {([
            { label: "Aujourd'hui (24 h)", d: apk.j1 },
            { label: "7 derniers jours", d: apk.j7 },
            { label: "30 derniers jours", d: apk.j30 },
          ]).map(({ label, d }) => (
            <div key={`apk-${label}`} className="text-center">
              <p className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-1.5">
                <Smartphone className="w-5 h-5 text-emerald-500" /> {d.c.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                dont {d.v.toLocaleString("fr-FR")} personne{d.v > 1 ? "s" : ""}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">téléchargements de l&apos;app · {label}</p>
            </div>
          ))}
        </div>

        {/* Prises de contact : l'étape entre « regarder » et « demander ». */}
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
          {([
            { label: "Aujourd'hui (24 h)", d: contacts.j1 },
            { label: "7 derniers jours", d: contacts.j7 },
            { label: "30 derniers jours", d: contacts.j30 },
          ]).map(({ label, d }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-1.5">
                <MessageCircle className="w-5 h-5 text-green-600" /> {d.total.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                dont {d.identifies.toLocaleString("fr-FR")} avec numéro
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">contacts · {label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpis.map(({ icon: Icon, label, value, color, href, urgent }) => (
          <a
            key={label}
            href={href}
            className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
                <Icon className="w-5 h-5" />
              </div>
              {urgent && (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                  <AlertCircle className="w-3 h-3" /> Action requise
                </span>
              )}
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
            <div className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">{label}</div>
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Dernières annonces */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Home className="w-4 h-4 text-blue-600" /> Dernières annonces
            </h2>
            <a href="/admin/annonces" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Voir tout →
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.lastProperties.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-6 text-center">Aucune annonce pour l&apos;instant</p>
            ) : stats.lastProperties.map((p: {
              id: string; titre: string; statut: string; type_offre: string;
              categorie: string; prix: number | null; quartier: string; created_at: string
            }) => (
              <a key={p.id} href={`/admin/annonces/${p.id}`} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.titre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.type_offre === "location" ? "Location" : "Vente"} · {p.quartier}
                    {p.prix ? ` · ${formatPrix(p.prix)}` : ""}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUT_PILL[p.statut] || "bg-gray-100 text-gray-500"}`}>
                  {STATUT_LABEL_DASH[p.statut] || p.statut.replace(/_/g, " ")}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Derniers leads */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" /> Derniers leads
            </h2>
            <a href="/admin/leads" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Voir tout →
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.lastLeads.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-6 text-center">Aucun lead pour l&apos;instant</p>
            ) : stats.lastLeads.map((l: {
              id: string; canal: string; statut: string; created_at: string; message: string | null;
              properties: { titre: string } | null
            }) => (
              <a key={l.id} href={`/admin/leads/${l.id}`} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {l.message ? l.message.substring(0, 50) + (l.message.length > 50 ? "…" : "") : "Nouvelle demande"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {l.properties?.titre ?? "Bien inconnu"} · via {l.canal}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUT_PILL[l.statut] || "bg-gray-100 text-gray-500"}`}>
                  {STATUT_LABEL_DASH[l.statut] || l.statut.replace(/_/g, " ")}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Alertes rapides */}
      {stats.enAttente > 0 && (
        <a
          href="/admin/annonces?statut=en_attente_validation"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 hover:bg-amber-100/60 transition-colors"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {stats.enAttente} annonce{stats.enAttente > 1 ? "s" : ""} en attente de validation
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Cliquez pour accéder à la file de modération
            </p>
          </div>
          <span className="ml-auto text-amber-600 text-sm">→</span>
        </a>
      )}
    </div>
  )
}
