"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import {
  Play, X, AlertTriangle, CheckCircle2, Loader2, Send, ToggleLeft, ToggleRight,
  MessageSquare, ChevronRight, Banknote, RefreshCw,
} from "lucide-react"
import {
  getTestFollowupMessage, processTestDigitReply, processTestInputReply,
  type TestMessage, type TestStepResult,
} from "./testFlowActions"

// ── Types locaux ───────────────────────────────────────────────────────────────

type BubbleRole = "system_out" | "agent_in" | "system_confirm" | "info"

interface Bubble {
  id: number
  role: BubbleRole
  text: string
  tag?: string   // ex: "Envoyé à l'agent", "Réponse agent", "Résultat"
}

interface PendingInput {
  type: "montant" | "rdv_date"
  label: string
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function TestFlowPanel({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false)
  const [applyChanges, setApplyChanges] = useState(false)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [currentOptions, setCurrentOptions] = useState<{ value: string; label: string }[]>([])
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [done, setDone] = useState(false)
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()
  const nextId = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  const addBubble = (b: Omit<Bubble, "id">) => {
    const id = nextId.current++
    setBubbles(prev => [...prev, { ...b, id }])
    return id
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [bubbles])

  function reset() {
    setBubbles([])
    setCurrentOptions([])
    setPendingInput(null)
    setInputValue("")
    setDone(false)
    setStep(0)
  }

  function handleOpen() {
    reset()
    setOpen(true)
    // Charge le premier message de relance
    startTransition(async () => {
      const msg = await getTestFollowupMessage(leadId)
      if (!msg) { addBubble({ role: "info", text: "Impossible de charger le lead.", tag: "Erreur" }); return }
      if (msg.context === "done") {
        addBubble({ role: "info", text: msg.waText, tag: "Info" })
        setDone(true)
        return
      }
      applyFirstFollowup(msg)
    })
  }

  function applyFirstFollowup(msg: TestMessage) {
    addBubble({ role: "system_out", text: msg.waText, tag: "Message envoyé à l'agent" })
    setCurrentOptions(msg.options)
    setStep(s => s + 1)
  }

  function handleOption(value: string, label: string) {
    if (isPending || done) return
    addBubble({ role: "agent_in", text: `${value} — ${label}`, tag: "Réponse de l'agent" })
    setCurrentOptions([])
    setPendingInput(null)

    startTransition(async () => {
      const result = await processTestDigitReply(leadId, value, applyChanges)
      applyResult(result)
    })
  }

  function handleInputSubmit() {
    if (!pendingInput || !inputValue.trim() || isPending) return
    const val = inputValue.trim()
    const { type, label } = pendingInput
    addBubble({ role: "agent_in", text: `${label} : ${val}`, tag: "Réponse de l'agent" })
    setPendingInput(null)
    setInputValue("")

    startTransition(async () => {
      const result = await processTestInputReply(leadId, val, type, applyChanges)
      applyResult(result)
    })
  }

  function applyResult(result: TestStepResult) {
    // Message de confirmation retourné à l'agent
    addBubble({ role: "system_confirm", text: result.confirmText, tag: "Confirmation agent" })

    if (result.error && !result.awaitingInput) {
      addBubble({ role: "info", text: result.error, tag: "Erreur" })
    }

    if (result.commission) {
      const fmt = (n: number) => n.toLocaleString("fr-FR") + " FCFA"
      addBubble({
        role: "info",
        text: [
          `Transaction : ${fmt(result.commission.montant)}`,
          `Commission totale : ${fmt(result.commission.total)}`,
          `  • Inaya : ${fmt(result.commission.partInaya)}`,
          `  • Agent : ${fmt(result.commission.partAgent)}`,
          applyChanges ? "✅ Transaction créée en base de données." : "⚠️ Mode simulation — aucune transaction réelle créée.",
        ].join("\n"),
        tag: "Récapitulatif financier",
      })
    }

    if (result.staffNotified) {
      addBubble({ role: "info", text: "📣 Le staff a été notifié que le client souhaite voir un autre bien.", tag: "Notification interne" })
    }

    if (result.awaitingInput) {
      setPendingInput({ type: result.awaitingInput, label: result.awaitingInputLabel ?? "Votre réponse" })
      setStep(s => s + 1)
    } else if (result.nextMessage) {
      // Enchaîne avec le prochain message de suivi
      const next = result.nextMessage
      setTimeout(() => {
        addBubble({ role: "system_out", text: next.waText, tag: `Message envoyé à l'agent (étape ${step + 1})` })
        setCurrentOptions(next.options)
        setStep(s => s + 1)
      }, 300)
    } else if (result.done) {
      addBubble({ role: "info", text: "✅ Processus terminé.", tag: "Fin du test" })
      setDone(true)
    }
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
      >
        <Play className="w-4 h-4" /> Tester le processus complet
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-6 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Play className="w-4 h-4 text-violet-600" /> Test du processus complet
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Simulation du flux WhatsApp agent → lead → transaction</p>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle appliquer / simuler */}
        <div className="px-5 py-2 border-b border-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {applyChanges
              ? "Mode test réel — les changements sont enregistrés en base"
              : "Mode simulation — aucun changement en base de données"}
          </span>
          <button
            onClick={() => setApplyChanges(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              applyChanges
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-gray-50 text-gray-500 border-gray-200"
            }`}
          >
            {applyChanges ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            {applyChanges ? "Réel" : "Simulation"}
          </button>
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {bubbles.map(b => <ChatBubble key={b.id} bubble={b} />)}

          {/* Indicateur de chargement */}
          {isPending && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Traitement en cours…
            </div>
          )}

          {/* Options de réponse agent */}
          {!isPending && currentOptions.length > 0 && !done && !pendingInput && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Simulez la réponse de l&apos;agent :</p>
              <div className="flex flex-col gap-1.5">
                {currentOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => handleOption(o.value, o.label)}
                    className="flex items-center gap-2 text-left px-3 py-2 rounded-xl border border-gray-200 bg-white hover:border-violet-400 hover:bg-violet-50 text-sm transition-colors"
                  >
                    <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{o.value}</span>
                    {o.label}
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input texte (montant ou date) */}
          {!isPending && pendingInput && !done && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
                {pendingInput.type === "montant" ? <Banknote className="w-3 h-3 inline mr-1" /> : <RefreshCw className="w-3 h-3 inline mr-1" />}
                {pendingInput.label}
              </p>
              <div className="flex gap-2">
                <input
                  type={pendingInput.type === "montant" ? "number" : "text"}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleInputSubmit()}
                  placeholder={pendingInput.type === "montant" ? "ex : 2500000" : "ex : 05/07 à 10h"}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 bg-gray-50"
                  autoFocus
                />
                <button
                  onClick={handleInputSubmit}
                  disabled={!inputValue.trim()}
                  className="px-3 py-2 bg-violet-600 text-white rounded-xl disabled:opacity-40 hover:bg-violet-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Pied : reset */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">Étape {step} · {bubbles.length} événement{bubbles.length > 1 ? "s" : ""}</span>
          <button
            onClick={() => { reset(); handleOpen() }}
            disabled={isPending}
            className="text-xs text-violet-600 hover:text-violet-800 font-medium disabled:opacity-40"
          >
            Recommencer depuis le début
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulle de conversation ──────────────────────────────────────────────────────

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isOut = bubble.role === "system_out"
  const isIn  = bubble.role === "agent_in"
  const isConf = bubble.role === "system_confirm"
  const isInfo = bubble.role === "info"

  if (isInfo) {
    return (
      <div className="mx-auto max-w-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-600 text-center space-y-0.5">
        {bubble.tag && <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{bubble.tag}</p>}
        <pre className="whitespace-pre-wrap font-sans">{bubble.text}</pre>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isIn ? "items-end" : "items-start"}`}>
      {bubble.tag && (
        <span className="text-[10px] text-gray-400 mb-0.5 px-1">{bubble.tag}</span>
      )}
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
        isOut  ? "bg-[#075E54] text-white rounded-tl-sm" :
        isIn   ? "bg-[#DCF8C6] text-gray-900 rounded-tr-sm" :
        isConf ? "bg-[#e9ecef] text-gray-800 rounded-tl-sm" :
        "bg-gray-100 text-gray-600"
      }`}>
        {isOut || isConf ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{bubble.text}</pre>
        ) : (
          <p className="font-medium">{bubble.text}</p>
        )}
      </div>
      {isOut && (
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <MessageSquare className="w-2.5 h-2.5 text-gray-300" />
          <span className="text-[10px] text-gray-300">WhatsApp — compte notifier</span>
        </div>
      )}
      {isConf && (
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
          <span className="text-[10px] text-gray-300">Reçu par l&apos;agent</span>
        </div>
      )}
      {isIn && (
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <AlertTriangle className="w-2.5 h-2.5 text-amber-300" />
          <span className="text-[10px] text-gray-300">Simulé</span>
        </div>
      )}
    </div>
  )
}
