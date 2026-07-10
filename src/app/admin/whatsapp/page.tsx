import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { Smartphone, Plus, AlertTriangle, Wifi, WifiOff, Ban, RefreshCw, ClipboardList } from "lucide-react"
import { formatRelativeDate } from "@/lib/utils"
import type { UserRole, WaEngine, WaStatus } from "@/types/database"
import WaAccountControls from "./WaAccountControls"
import QrDisplay from "./QrDisplay"
import GroupsManager from "./GroupsManager"
import NotifStats from "./NotifStats"
import WaDiagnostic from "./WaDiagnostic"
import GupshupStatusCard from "./GupshupStatusCard"
import { createWaAccount } from "./actions"

export const metadata = { title: "Comptes WhatsApp · Inaya Immo" }

interface WaRow {
  id: string; nom: string; numero: string; engine: WaEngine; status: WaStatus
  actif: boolean; role: string; groupes_surveilles: unknown[]; dernier_ping: string | null
  reconnexions_count: number; qr_data: string | null; qr_expires_at: string | null
}

const STATUS_META: Record<WaStatus, { label: string; cls: string; Icon: typeof Wifi }> = {
  connecte:      { label: "Connecté",      cls: "bg-green-50 text-green-700",  Icon: Wifi },
  deconnecte:    { label: "Déconnecté",    cls: "bg-gray-100 text-gray-500",   Icon: WifiOff },
  banni:         { label: "Banni",         cls: "bg-red-50 text-red-700",      Icon: Ban },
  en_reconnexion:{ label: "Reconnexion…",  cls: "bg-amber-50 text-amber-700",  Icon: RefreshCw },
}

// Seuil au-delà duquel on suspecte un socket "zombie" (cf. INAYA-WA-007)
const ZOMBIE_THRESHOLD = 5

async function addAccount(form: FormData) {
  "use server"
  await createWaAccount(form)
}

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/whatsapp")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const { data } = await supabase
    .from("whatsapp_accounts")
    .select("id,nom,numero,engine,status,actif,role,groupes_surveilles,dernier_ping,reconnexions_count,qr_data,qr_expires_at")
    .order("created_at", { ascending: false })
  const accounts = (data ?? []) as WaRow[]

  // Stats notifications WhatsApp pour le panneau de diagnostic
  const adminDb = createAdminClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pendingRes, erroredRes, sent24hRes] = await Promise.all([
    adminDb.from("notifications").select("id", { count: "exact", head: true })
      .eq("canal", "whatsapp").eq("envoye", false).is("code_erreur", null),
    adminDb.from("notifications").select("id", { count: "exact", head: true })
      .eq("canal", "whatsapp").eq("envoye", false).not("code_erreur", "is", null),
    adminDb.from("notifications").select("id", { count: "exact", head: true })
      .eq("canal", "whatsapp").eq("envoye", true).gte("envoye_le", since24h),
  ])
  const notifStats = {
    pending: pendingRes.count ?? 0,
    errored: erroredRes.count ?? 0,
    sent24h: sent24hRes.count ?? 0,
  }

  // Statut Gupshup (config + moteur OTP effectif) — les clés Gupshup ne vivent
  // que sur Railway (whatsapp-service), d'où l'appel /health plutôt qu'un env local.
  const gupshupConfigured = await fetch(`${process.env.WA_SERVICE_URL ?? ""}/health`, {
    headers: process.env.WA_HTTP_SECRET ? { "x-inaya-secret": process.env.WA_HTTP_SECRET } : {},
    signal: AbortSignal.timeout(3000), cache: "no-store",
  }).then(r => r.json()).then(d => (d as { gupshupConfigured?: boolean }).gupshupConfigured ?? false)
    .catch(() => null as boolean | null)
  const otpEngine: "gupshup" | "baileys" =
    process.env.WA_OTP_ENGINE === "baileys" || !gupshupConfigured ? "baileys" : "gupshup"

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-blue-600" /> Comptes WhatsApp
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Multi-comptes, multi-moteurs · le moteur de chaque compte est modifiable sans redéploiement
          </p>
        </div>
        <Link href="/admin/whatsapp/messages"
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
          <ClipboardList className="w-4 h-4 text-blue-600" /> Journal des messages
        </Link>
      </div>

      {/* Diagnostic service + test envoi direct */}
      <WaDiagnostic />

      {/* Statut moteur Gupshup / OTP */}
      <GupshupStatusCard gupshupConfigured={gupshupConfigured} otpEngine={otpEngine} />

      {/* Panneau diagnostic notifications */}
      <NotifStats {...notifStats} />

      {/* Ajout rapide */}
      <form action={addAccount} className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-600" /> Ajouter un compte
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input name="nom" placeholder="Nom (ex. Inaya principal)" required
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
          <input name="numero" placeholder="Numéro (+225…)" required
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
          <select name="engine" defaultValue="baileys"
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400">
            <option value="baileys">Baileys</option>
            <option value="wppconnect">WPPConnect</option>
            <option value="whatsmeow">whatsmeow</option>
            <option value="whatsapp_web_js">whatsapp-web.js</option>
            <option value="venom_bot">Venom Bot</option>
            <option value="waapi">WaAPI</option>
            <option value="api_officielle">API officielle (Cloud)</option>
            <option value="twilio">Twilio</option>
          </select>
          <button type="submit"
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
            Ajouter
          </button>
        </div>
      </form>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-10 text-center">Aucun compte WhatsApp configuré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">
                  <th className="px-4 py-3">Compte</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Groupes</th>
                  <th className="px-4 py-3">Reconnexions</th>
                  <th className="px-4 py-3">Dernier ping</th>
                  <th className="px-4 py-3">Appairage QR</th>
                <th className="px-4 py-3 text-right">Moteur · État · Suppr.</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => {
                  const meta = STATUS_META[a.status]
                  const zombie = a.reconnexions_count >= ZOMBIE_THRESHOLD
                  return (
                    <tr key={a.id} className={`border-t border-gray-50 hover:bg-gray-50/60 transition-colors ${!a.actif ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{a.nom}</p>
                        <p className="text-xs text-gray-400 font-mono">{a.numero}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${meta.cls}`}>
                          <meta.Icon className="w-3 h-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <GroupsManager
                          accountId={a.id}
                          watched={(a.groupes_surveilles ?? []) as { id: string; nom?: string }[]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${zombie ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                          {a.reconnexions_count}
                        </span>
                        {zombie && (
                          <span title="Socket potentiellement zombie (INAYA-WA-007)" className="ml-1 inline-flex items-center text-amber-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {a.dernier_ping ? formatRelativeDate(a.dernier_ping) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <QrDisplay accountId={a.id} initialStatus={a.status} />
                      </td>
                      <td className="px-4 py-3">
                        <WaAccountControls id={a.id} engine={a.engine} actif={a.actif} role={(a.role as "ingestion" | "notifier") ?? "ingestion"} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Le compteur de reconnexions sert à détecter les sockets « zombies » (≥ {ZOMBIE_THRESHOLD} → alerte).
        Le service d&apos;ingestion met à jour <code>status</code>, <code>dernier_ping</code> et <code>reconnexions_count</code>.
      </p>
    </div>
  )
}
