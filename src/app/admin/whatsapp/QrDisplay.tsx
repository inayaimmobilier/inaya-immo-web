"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, CheckCircle2, QrCode, RefreshCw, Hash, Copy, Check, AlertCircle } from "lucide-react"

type Tab = "qr" | "code"

interface Props { accountId: string; initialStatus: string }

export default function QrDisplay({ accountId, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("qr")

  // ── QR state ──
  const [qrLoading, setQrLoading] = useState(true)
  const [hasQr, setHasQr] = useState(false)
  const [imgKey, setImgKey] = useState(0)
  const [qrError, setQrError] = useState<string | null>(null)

  // ── Pairing code state ──
  const [codeLoading, setCodeLoading] = useState(false)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [codeExpiry, setCodeExpiry] = useState<number | null>(null) // timestamp ms

  // ── QR polling ──
  useEffect(() => {
    if (!open || tab !== "qr") return
    let active = true
    setQrLoading(true)
    setQrError(null)

    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/whatsapp/${accountId}/qr`, { cache: "no-store" })
        if (!active) return
        if (res.headers.get("content-type")?.includes("image/png")) {
          setHasQr(true)
          setImgKey(k => k + 1)
          setQrLoading(false)
          setQrError(null)
        } else {
          const json = await res.json() as { status?: string; qr?: boolean; expired?: boolean }
          setStatus(json.status ?? status)
          setHasQr(false)
          setQrLoading(false)
          if (json.expired) setQrError("QR expiré — nouveau QR en cours de génération…")
          else setQrError(null)
        }
      } catch {
        if (active) { setQrLoading(false); setQrError("Erreur réseau") }
      }
    }

    poll()
    const id = setInterval(() => { if (active) poll() }, 3000)
    return () => { active = false; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, accountId])

  // ── Countdown for pairing code ──
  useEffect(() => {
    if (!codeExpiry) return
    const id = setInterval(() => {
      if (Date.now() >= codeExpiry) {
        setPairingCode(null)
        setCodeExpiry(null)
        setCodeError("Code expiré (3 min). Générez-en un nouveau.")
        clearInterval(id)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [codeExpiry])

  const requestCode = useCallback(async () => {
    setCodeLoading(true)
    setCodeError(null)
    setPairingCode(null)
    setCodeExpiry(null)
    try {
      const res = await fetch(`/api/admin/whatsapp/${accountId}/pairing-code`, { method: "POST" })
      const json = await res.json() as { ok?: boolean; code?: string; error?: string }
      if (!res.ok || !json.ok) {
        setCodeError(json.error ?? "Erreur inconnue")
      } else {
        setPairingCode(json.code ?? null)
        setCodeExpiry(Date.now() + 3 * 60 * 1000)
      }
    } catch {
      setCodeError("Erreur réseau — vérifiez que le service est démarré")
    } finally {
      setCodeLoading(false)
    }
  }, [accountId])

  function copyCode() {
    if (!pairingCode) return
    navigator.clipboard.writeText(pairingCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function openModal() {
    setOpen(true)
    setTab("qr")
    setQrLoading(true)
    setHasQr(false)
    setQrError(null)
    setPairingCode(null)
    setCodeError(null)
    setCodeExpiry(null)
  }

  const remainingSecs = codeExpiry ? Math.max(0, Math.ceil((codeExpiry - Date.now()) / 1000)) : null

  if (status === "connecte") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Connecté
      </span>
    )
  }

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <QrCode className="w-3.5 h-3.5" /> Connecter
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Appairage WhatsApp</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setTab("qr")}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${tab === "qr" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <QrCode className="w-3.5 h-3.5" /> Scanner le QR
              </button>
              <button
                onClick={() => setTab("code")}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${tab === "code" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Hash className="w-3.5 h-3.5" /> Code à 8 chiffres
              </button>
            </div>

            {/* ── QR TAB ── */}
            {tab === "qr" && (
              <div>
                {qrLoading ? (
                  <div className="flex flex-col items-center py-8 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <p className="text-xs text-gray-500 text-center">En attente du QR code…</p>
                    <p className="text-xs text-gray-400 text-center">
                      Le service WhatsApp doit être démarré.<br />
                      <code className="bg-gray-100 px-1 rounded">pm2 restart inaya-whatsapp-service</code>
                    </p>
                  </div>
                ) : hasQr ? (
                  <div className="space-y-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={imgKey}
                      src={`/api/admin/whatsapp/${accountId}/qr?t=${imgKey}`}
                      alt="QR WhatsApp"
                      className="w-full rounded-xl border border-gray-100"
                    />
                    <p className="text-xs text-gray-500 text-center">
                      Ouvrez WhatsApp → <strong>Appareils associés</strong> → <strong>Associer un appareil</strong>
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      <RefreshCw className="w-3 h-3" /> QR actualisé automatiquement toutes les 90 s
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-6 gap-3">
                    {qrError && (
                      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 w-full">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{qrError}</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 text-center">
                      Aucun QR disponible.<br />
                      Assurez-vous que le service est démarré et réessayez.
                    </p>
                    <button
                      onClick={() => { setQrLoading(true); setHasQr(false); setImgKey(k => k + 1) }}
                      className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" /> Réessayer
                    </button>
                    <button
                      onClick={() => setTab("code")}
                      className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
                    >
                      <Hash className="w-3 h-3" /> Essayer avec un code à 8 chiffres
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── CODE TAB ── */}
            {tab === "code" && (
              <div className="space-y-4">
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Alternative au QR : entrez ce code dans WhatsApp sur le téléphone :</p>
                  <p className="text-gray-400">
                    <strong>WhatsApp</strong> → <strong>Appareils associés</strong> → <strong>Associer par numéro de téléphone</strong>
                  </p>
                </div>

                {pairingCode ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-center font-mono text-2xl font-bold tracking-[0.3em] text-gray-900 bg-gray-50 rounded-xl py-4 border border-gray-200">
                        {pairingCode}
                      </div>
                      <button
                        onClick={copyCode}
                        title="Copier le code"
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Expire dans <strong className={remainingSecs !== null && remainingSecs < 60 ? "text-red-600" : "text-gray-700"}>{remainingSecs}s</strong></span>
                      <button onClick={requestCode} className="text-blue-600 hover:underline flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Nouveau code
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {codeError && (
                      <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{codeError}</span>
                      </div>
                    )}
                    <button
                      onClick={requestCode}
                      disabled={codeLoading}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
                    >
                      {codeLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération…</>
                        : <><Hash className="w-4 h-4" /> Générer un code d&apos;appairage</>}
                    </button>
                    <p className="text-xs text-gray-400 text-center">
                      Fonctionne uniquement si le service WhatsApp est démarré<br />et le compte pas encore connecté.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
