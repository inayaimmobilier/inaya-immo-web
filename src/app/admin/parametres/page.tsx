import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Settings, TrendingUp, Smartphone, Users, Save, Bot, KeyRound, CheckCircle2, RefreshCw } from "lucide-react"
import type { UserRole } from "@/types/database"
import { saveSettings } from "./actions"
import { MODEL_CATALOG, PROVIDER_LIST } from "@/lib/llm"
import { configuredSecretNames } from "@/lib/secrets"
import { getPropertyTypes } from "@/lib/property-types-server"
import PropertyTypesManager from "./PropertyTypesManager"

export const metadata = { title: "Paramètres · Inaya Immo" }

interface PageProps { searchParams: Promise<{ ok?: string }> }

const CANAUX = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "push", label: "Push (app interne Pi)" },
  { value: "email", label: "E-mail" },
]

async function save(form: FormData) {
  "use server"
  await saveSettings(form)
  redirect("/admin/parametres?ok=1")
}

export default async function ParametresPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/connexion?redirect=/admin/parametres")
  const { data: meData } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const myRole = ((meData as { role: UserRole } | null)?.role ?? "client")
  if (myRole !== "super_admin" && myRole !== "admin") redirect("/admin/dashboard")

  const propertyTypes = await getPropertyTypes()
  const { data: settingsData } = await supabase.from("app_settings").select("key,value")
  const settings = new Map((settingsData ?? []).map(s => [(s as { key: string }).key, (s as { value: unknown }).value]))
  // Quels fournisseurs ont déjà une clé en base (statut affiché, jamais la valeur).
  const configuredKeys = new Set(await configuredSecretNames())
  const get = (k: string, fallback = "") => {
    const v = settings.get(k)
    return v == null ? fallback : String(v)
  }
  const canaux = (settings.get("notif_canaux") as string[] | undefined) ?? []
  const followupFreq = get("followup_frequency_hours", "24")
  const followupStatuts = (settings.get("followup_statuts") as string[] | undefined) ?? ["en_traitement", "contacte", "visite_planifiee"]

  const field = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
  const label = "block text-xs font-medium text-gray-600 mb-1.5"

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" /> Paramètres
        </h1>
        <p className="text-sm text-gray-500 mt-1">Configuration générale de la plateforme</p>
      </div>

      {params.ok && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          Paramètres enregistrés.
        </div>
      )}

      {/* Types de biens gérés par l'admin (recherche accueil + filtres) */}
      <div className="max-w-2xl">
        <PropertyTypesManager initial={propertyTypes} />
      </div>

      <form action={save} className="space-y-5 max-w-2xl">
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Général</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Nom de la plateforme</label>
              <input name="nom_plateforme" defaultValue={get("nom_plateforme", "Inaya Immo")} className={field} />
            </div>
            <div>
              <label className={label}>Ville principale</label>
              <input name="ville_principale" defaultValue={get("ville_principale", "Bouaké")} className={field} />
            </div>
            <div>
              <label className={label}>Devise</label>
              <input name="devise" defaultValue={get("devise", "XOF")} className={field} />
            </div>
            <div>
              <label className={label}>Délai d&apos;expiration des annonces (jours)</label>
              <input type="number" name="delai_expiration_jours" defaultValue={get("delai_expiration_jours", "30")} className={field} />
            </div>
            <div>
              <label className={label}>Commission résidences meublées (%)</label>
              <input type="number" name="commission_residence_pct" min={0} max={100}
                defaultValue={get("commission_residence_pct", "10")} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Contact support</label>
              <input name="contact_support" defaultValue={get("contact_support")} placeholder="+225…" className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Pixel Meta (Facebook) — ID</label>
              <input name="meta_pixel_id" defaultValue={get("meta_pixel_id")} inputMode="numeric" placeholder="ex. 1234567890123456" className={field} />
              <p className="text-xs text-gray-400 mt-1">
                Depuis Meta Events Manager → votre Pixel → ID (16 chiffres). Laissez vide pour désactiver le suivi Meta.
              </p>
            </div>
          </div>
        </section>

        {/* Page d'accueil (hero) */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Page d&apos;accueil</h2>
          <p className="text-xs text-gray-500">Le grand titre affiché en haut du site. La partie « accent » est mise en surbrillance (jaune).</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Titre</label>
              <input name="hero_titre" defaultValue={get("hero_titre", "L'immobilier en Côte d'Ivoire")} className={field} />
            </div>
            <div>
              <label className={label}>Accent (surligné)</label>
              <input name="hero_titre_accent" defaultValue={get("hero_titre_accent", "simplifiée")} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Sous-titre</label>
              <textarea name="hero_sous_titre" rows={2}
                defaultValue={get("hero_sous_titre", "Annonces vérifiées par nos agents. Location, vente, gestion de biens. Votre maison, entre de bonnes mains.")}
                className={`${field} resize-none`} />
            </div>
          </div>

          <p className="text-xs text-gray-500 pt-2">Statistiques affichées sous la barre de recherche (laisser vide = valeur automatique).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Annonces vérifiées</label>
              <input name="stat_annonces" defaultValue={get("stat_annonces")} placeholder="auto" className={field} />
            </div>
            <div>
              <label className={label}>Quartiers couverts</label>
              <input name="stat_quartiers" defaultValue={get("stat_quartiers", "14")} className={field} />
            </div>
            <div>
              <label className={label}>Transactions conclues</label>
              <input name="stat_transactions" defaultValue={get("stat_transactions")} placeholder="auto" className={field} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Canaux de notification interne</h2>
          <div className="flex flex-wrap gap-4">
            {CANAUX.map(c => (
              <label key={c.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="notif_canaux" value={c.value}
                  defaultChecked={canaux.includes(c.value)} className="w-4 h-4 rounded accent-blue-600" />
                {c.label}
              </label>
            ))}
          </div>
        </section>

        {/* Section suivi automatique des leads */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600" /> Suivi automatique des leads (relances agents)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Le système envoie automatiquement un message WhatsApp à l&apos;agent assigné pour lui demander
              l&apos;avancement de chaque lead actif, à la fréquence ci-dessous.
              L&apos;agent répond 1-5 pour faire avancer le statut jusqu&apos;à la clôture et au calcul de commission.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Fréquence de relance (heures)</label>
              <input type="number" name="followup_frequency_hours" min={1} max={168}
                defaultValue={followupFreq} className={field}
                title="Ex : 24 = une relance toutes les 24h si le lead n'a pas avancé" />
            </div>
          </div>
          <div>
            <label className={label}>Statuts de lead qui déclenchent une relance</label>
            <div className="flex flex-wrap gap-4 mt-1">
              {[
                { value: "en_traitement", label: "En traitement" },
                { value: "contacte", label: "Client contacté" },
                { value: "visite_planifiee", label: "Visite planifiée" },
                { value: "visite_effectuee", label: "Visite effectuée (décision client)" },
                { value: "paiement_planifie", label: "RDV paiement (confirmation)" },
              ].map(s => (
                <label key={s.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="followup_statuts" value={s.value}
                    defaultChecked={followupStatuts.includes(s.value)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600" /> Assistant IA (modèle de langage)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Modèle utilisé par l&apos;assistant qui répond aux clients et propose des annonces.
              La clé API du fournisseur choisi doit être renseignée dans les variables d&apos;environnement.
            </p>
          </div>
          <select name="assistant_model" defaultValue={get("assistant_model", "claude-haiku")} className={field}>
            <optgroup label="Open source (recommandés — coût maîtrisé)">
              {MODEL_CATALOG.filter(m => m.openSource).map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Propriétaires">
              {MODEL_CATALOG.filter(m => !m.openSource).map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          </select>
          <p className="text-xs text-gray-400">
            Fournisseurs supportés : Anthropic, OpenAI (ChatGPT), DeepSeek, Groq, Together, Mistral, OpenRouter.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600" /> Clés API des fournisseurs
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Saisissez la clé du fournisseur dont vous utilisez le modèle. Les clés sont stockées de façon
              sécurisée et ne sont jamais réaffichées. Laissez un champ vide pour conserver la clé existante.
            </p>
          </div>
          <div className="space-y-3">
            {PROVIDER_LIST.map(p => {
              const set = configuredKeys.has(p.envKey)
              return (
                <div key={p.id}>
                  <label className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">{p.label}</span>
                    {set ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> configurée
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">non configurée</span>
                    )}
                  </label>
                  <input
                    type="password"
                    name={`secret_${p.envKey}`}
                    autoComplete="new-password"
                    placeholder={set ? "•••••••••• (laisser vide pour conserver)" : `Clé ${p.label}`}
                    className={field}
                  />
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Instruction de modération IA</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Instruction donnée à Claude pour approuver ou rejeter chaque annonce soumise (via WhatsApp ou formulaire web).
              Laisser vide pour utiliser l&apos;instruction par défaut.
            </p>
          </div>
          <textarea
            name="ia_moderation_prompt"
            rows={10}
            defaultValue={get("ia_moderation_prompt")}
            placeholder="Tu es un modérateur immobilier…"
            className={`${field} resize-y font-mono text-xs`}
          />
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            ⚠️ Cette instruction s&apos;applique à toutes les nouvelles annonces. Une instruction trop permissive
            ou trop restrictive peut affecter la qualité du catalogue.
          </p>
        </section>

        <button type="submit" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Save className="w-4 h-4" /> Enregistrer
        </button>
      </form>

      {/* Raccourcis vers les autres modules de config */}
      <section className="max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Configuration avancée</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: "/admin/commissions", icon: TrendingUp, label: "Règles de commission" },
            { href: "/admin/whatsapp", icon: Smartphone, label: "Comptes WhatsApp" },
            { href: "/admin/utilisateurs", icon: Users, label: "Utilisateurs & rôles" },
          ].map(({ href, icon: Icon, label }) => (
            <a key={href} href={href}
              className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
