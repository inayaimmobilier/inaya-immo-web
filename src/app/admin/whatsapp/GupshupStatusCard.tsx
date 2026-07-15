import { CheckCircle2, XCircle, Zap } from "lucide-react"

export default function GupshupStatusCard({
  gupshupConfigured, otpEngine, dispatchEngine,
}: { gupshupConfigured: boolean | null; otpEngine: "gupshup" | "baileys"; dispatchEngine?: string | null }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <Zap className="w-4 h-4 text-blue-600" /> Moteur d&apos;envoi Gupshup
      </h2>
      <div className="flex items-center gap-2 text-xs">
        {gupshupConfigured === null ? (
          <span className="text-gray-400">Statut inconnu (service injoignable).</span>
        ) : gupshupConfigured ? (
          <span className="flex items-center gap-1.5 text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Configuré (clé API + template renseignés sur Railway)
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-500">
            <XCircle className="w-3.5 h-3.5" /> Non configuré — envoi via Baileys par défaut
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        Code de vérification (OTP) actuellement envoyé via :{" "}
        <span className={`font-medium ${otpEngine === "baileys" ? "text-amber-700" : "text-blue-700"}`}>
          {otpEngine === "baileys" ? "Baileys (repli temporaire)" : "Gupshup"}
        </span>
      </div>
      {dispatchEngine && (
        <div className="text-xs text-gray-500">
          Notifications (alertes, leads…) envoyées via :{" "}
          <span className={`font-medium ${dispatchEngine === "baileys" ? "text-amber-700" : "text-blue-700"}`}>
            {dispatchEngine === "baileys" ? "Baileys (repli)" : "Gupshup"}
          </span>
        </div>
      )}
      {dispatchEngine === "baileys" && (
        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
          Repli notifications actif via <code>WA_DISPATCH_ENGINE=baileys</code>. Retirez cette variable une fois
          le numéro officiel Gupshup rétabli (livraison confirmée).
        </p>
      )}
      {otpEngine === "baileys" && (
        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
          Repli actif via <code>WA_OTP_ENGINE=baileys</code> (Vercel). Une fois le template OTP Gupshup approuvé
          par Meta, retirez cette variable pour revenir au moteur officiel.
        </p>
      )}
    </div>
  )
}
